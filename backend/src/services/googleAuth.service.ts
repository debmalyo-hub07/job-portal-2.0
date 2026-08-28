import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose, { type HydratedDocument } from "mongoose";
import type { Request, Response } from "express";
import { googleCallbackQuerySchema, type Portal } from "@jobportal/shared";
import { env, googleRedirectUri } from "../config/env.js";
import { googleTxnKey } from "../lib/keys.js";
import { googleOAuth, type GoogleIdentity } from "../lib/googleOAuth.js";
import { clearGoogleTxnCookie, googleTxnCookieName, setGoogleTxnCookie } from "../lib/cookies.js";
import { accountModel, findAccountByEmail, type AccountDocument } from "./account.service.js";
import { revokeAllForSubject } from "./session.service.js";
import {
  isDuplicateKeyError,
  releaseEmail,
  reserveEmail,
} from "./emailRegistry.service.js";
import { OtpCode } from "../models/otpCode.model.js";
import { dispatch, sendRendered } from "../lib/mailer.js";
import { renderAccountClaimedEmail, renderGoogleLinkEmail } from "../lib/emailTemplates.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/AppError.js";

/** Same reason as auth.service.ts: InferSchemaType has no `_id`. */
type AccountDoc = HydratedDocument<AccountDocument>;

/**
 * The refusal shapes the stranger branch answers distinctly (see the catch in
 * branch 3): the registry's translated `EMAIL_TAKEN` (address held on another
 * portal) and a raw E11000 off the per-collection index (a raced same-portal
 * first sign-in, or registry drift made loud).
 */
function isEmailRefused(error: unknown): boolean {
  if (isDuplicateKeyError(error)) return true;
  return error instanceof AppError && error.code === "EMAIL_TAKEN";
}

interface TxnClaims {
  purpose: "google-txn";
  portal: Portal;
  verifier: string;
  nonce: string;
  state: string;
}

/**
 * Mints the PKCE verifier, nonce and state; binds all three PLUS THE PORTAL
 * into a signed httpOnly cookie; returns Google's consent URL.
 *
 * The portal never appears in `state` or any URL parameter — a signed value in
 * the URL is still swappable (replay someone else's validly-signed state); a
 * value in an httpOnly cookie on THIS browser is neither editable nor
 * swappable.
 */
export function startGoogleFlow(portal: Portal, res: Response): string {
  const verifier = randomBytes(32).toString("base64url"); // RFC 7636 §4.1 length
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const state = randomBytes(16).toString("base64url");

  const txn: TxnClaims = { purpose: "google-txn", portal, verifier, nonce, state };
  setGoogleTxnCookie(res, jwt.sign(txn, googleTxnKey(), { expiresIn: "10m" }));

  return googleOAuth().authUrl({
    redirectUri: googleRedirectUri(portal),
    state,
    nonce,
    codeChallenge: challenge,
  });
}

export type CallbackOutcome =
  | { kind: "signed-in"; account: AccountDoc }
  | { kind: "link-pending" }
  | { kind: "address-taken" }
  | { kind: "failed" };

function googleCallbackFailed(portal: Portal, reason: string): CallbackOutcome {
  logger.warn({ portal, reason }, "google callback rejected");
  return { kind: "failed" };
}

/**
 * Every failure collapses to one outcome. Which check tripped — state, nonce,
 * portal, exchange, verification — is for the server log, never for the URL:
 * distinct failure codes would hand a prober a map of the defences.
 */
export async function handleGoogleCallback(
  portal: Portal,
  req: Request,
  res: Response,
): Promise<CallbackOutcome> {
  // Google is a seeker and recruiter credential, never an admin one. The
  // admin router mounts no Google routes, and this is the second, independent
  // refusal: the stranger branch writes `status: "active"` for every portal
  // but recruiter, so a future remount of the Google routes under /admin
  // would otherwise let any Gmail mint the highest-privilege account. The
  // route comment in auth.route.ts once claimed this service refused admin
  // creation "anyway" — it did not, between the recruiter-creation change and
  // this guard.
  if (portal === "admin") return googleCallbackFailed(portal, "admin-portal");

  clearGoogleTxnCookie(res); // single-use, success or failure

  const raw = req.cookies?.[googleTxnCookieName()] as string | undefined;
  const query = googleCallbackQuerySchema.safeParse(req.query);
  if (!query.success) return googleCallbackFailed(portal, "invalid-query");
  const { code, state } = query.data;
  if (!raw) return googleCallbackFailed(portal, "missing-transaction-cookie");
  if (!code || !state) return googleCallbackFailed(portal, "missing-code-or-state");

  let txn: TxnClaims;
  try {
    txn = jwt.verify(raw, googleTxnKey()) as TxnClaims;
  } catch {
    return googleCallbackFailed(portal, "invalid-transaction-cookie");
  }
  if (txn.purpose !== "google-txn") return googleCallbackFailed(portal, "wrong-purpose");
  // The mount is the truth and the cookie must AGREE with it: a transaction
  // started on the seeker portal presented to the recruiter callback dies
  // here, portal-pinned server-side (amendment, medium finding 3).
  if (txn.portal !== portal) return googleCallbackFailed(portal, "portal-mismatch");
  // Login-CSRF: an attacker-initiated flow completing in the victim's browser
  // carries the attacker's state but the victim's cookie. Mismatch → dead.
  if (txn.state !== state) return googleCallbackFailed(portal, "state-mismatch");

  let identity: GoogleIdentity;
  try {
    identity = await googleOAuth().exchange({
      code,
      codeVerifier: txn.verifier,
      redirectUri: googleRedirectUri(portal),
    });
  } catch (error) {
    logger.warn({ err: error, portal }, "google token exchange failed");
    return googleCallbackFailed(portal, "token-exchange");
  }

  // The library checked signature, expiry and (because we passed it) aud.
  // nonce and email_verified are OURS to check — it does neither.
  if (!identity.nonce || identity.nonce !== txn.nonce) {
    return googleCallbackFailed(portal, "nonce-mismatch");
  }
  if (!identity.emailVerified) return googleCallbackFailed(portal, "email-unverified");

  return resolveIdentity(portal, identity);
}

/** The amendment's resolution order, branch for branch. */
async function resolveIdentity(
  portal: Portal,
  identity: GoogleIdentity,
): Promise<CallbackOutcome> {
  const model = accountModel(portal);

  // Branch 1: known Google identity. Keyed on `sub`, never email — an email
  // can move between Google accounts; a `sub` cannot.
  const bySub = await model.findOne({ googleId: identity.sub });
  if (bySub) {
    // Suspended only — a pending recruiter signs in and meets the approval gate
    // at the routes that matter, same as the password path.
    if (bySub.status === "suspended") return { kind: "failed" };
    return { kind: "signed-in", account: bySub };
  }

  // `withSecret` because branch 2a below turns on whether this account has a
  // password at all.
  const byEmail = await findAccountByEmail(portal, identity.email, { withSecret: true });

  // Branch 3 is account creation for either public portal. Recruiters enter
  // the same pending-approval state as password registration, so Google changes
  // the credential only; it never bypasses portal authorization. Admins never
  // reach here because their router mounts no Google routes.
  // Branch 3: complete stranger → create, already verified (Google attested
  // the mailbox and we independently required email_verified above).
  if (!byEmail) {
    try {
      // Registry-first, like register(): the address is claimed across ALL
      // portals before the account exists, with the account's _id minted up
      // front. A recruiter already holding this address means the Google
      // stranger cannot have a seeker account with it — the 2026-08-27
      // one-address-one-account rule.
      const subjectId = await reserveEmail(portal, identity.email);
      let created: AccountDoc;
      try {
        created = await model.create({
          _id: subjectId,
          email: identity.email.toLowerCase(),
          // `?? "Member"` is not defensive noise: `noUncheckedIndexedAccess` is
          // on, so `split("@")[0]` is `string | undefined`, and `fullName` is
          // required with a 2-character minimum. A Google account with no name
          // and a single-character local part would otherwise fail schema
          // validation here — after the OAuth round trip, where the only place
          // to report it is a redirect to /auth/error.
          fullName: identity.fullName ?? identity.email.split("@")[0] ?? "Member",
          googleId: identity.sub,
          passwordHash: null,
          emailVerifiedAt: new Date(),
          avatarUrl: identity.avatarUrl,
          status: portal === "recruiter" ? "pending" : "active",
        });
      } catch (error) {
        // The account never took the address: give it back before failing.
        await releaseEmail(subjectId);
        throw error;
      }
      return { kind: "signed-in", account: created };
    } catch (error) {
      // Both duplicate shapes — the registry refusing a cross-portal address,
      // and the same-portal index on a raced first sign-in — are the one
      // refusal that is safe to NAME, unlike every other check below. The
      // viewer proved mailbox control to Google to get this far, and
      // register() already answers EMAIL_TAKEN to anyone with no proof at
      // all, so this sentence discloses nothing an attacker could not learn
      // by attempting registration. The re-read covers the only race the
      // registry cannot see: this identity's own concurrent first sign-in
      // winning on another tab.
      if (isEmailRefused(error)) {
        const raced = await model.findOne({ googleId: identity.sub });
        if (raced) return { kind: "signed-in", account: raced };
        return { kind: "address-taken" };
      }
      throw error;
    }
  }

  if (byEmail.status === "suspended") return { kind: "failed" };

  // Branch 2a: local account with NO password → there are no credentials to
  // steal, so linking is takeover-proof. Guarded update so a raced link loses.
  if ((byEmail.passwordHash ?? null) === null) {
    const linked = await model.findOneAndUpdate(
      { _id: byEmail._id, googleId: null },
      { $set: { googleId: identity.sub } },
      { new: true },
    );
    return linked ? { kind: "signed-in", account: linked } : { kind: "failed" };
  }

  // Branch 2c: password + UNVERIFIED → takeover IN PLACE, atomically, guarded
  // on the exact preconditions. This is the anti-plant branch: an attacker
  // registered the victim's address with a password they know and never
  // verified; nulling the password and verifying leaves the plant worthless
  // while keeping `_id` (team invites, provisioned rows) intact. Deletion was
  // the amendment's second critical finding — do not "simplify" back to it.
  if (byEmail.emailVerifiedAt === null) {
    const taken = await model.findOneAndUpdate(
      { _id: byEmail._id, emailVerifiedAt: null, googleId: null },
      {
        $set: {
          googleId: identity.sub,
          passwordHash: null,
          emailVerifiedAt: new Date(),
          sessionsInvalidatedAt: new Date(),
          pendingGoogleLink: { googleId: null, requestedAt: null },
        },
      },
      { new: true },
    );
    if (!taken) return { kind: "failed" };
    // Idempotent cleanup AFTER the atomic flip. Single-document atomicity is
    // the security boundary here; a multi-document transaction would demand a
    // replica set (which mongodb-memory-server and the dev box don't run), and
    // buys nothing: an unverified account can hold no sessions (login refuses
    // it before ever issuing one), so these deletes are belt-and-braces that
    // are safe to repeat if a crash lands between them.
    await revokeAllForSubject(taken._id, portal);
    await OtpCode.deleteMany({ subjectId: taken._id, subjectType: portal });
    dispatch(sendRendered(taken.email, renderAccountClaimedEmail()));
    return { kind: "signed-in", account: taken };
  }

  // Branch 2b: password + verified → STEP-UP, never auto-link. Google's
  // email_verified attests the domain's CURRENT operator, not this human's
  // history with the mailbox (lapsed-and-re-registered domains, malicious
  // Workspace admins). The link activates only from the mailbox. Latest
  // attempt wins; the fresh pending record invalidates any older mail.
  await model.updateOne(
    { _id: byEmail._id },
    { $set: { pendingGoogleLink: { googleId: identity.sub, requestedAt: new Date() } } },
  );
  const token = jwt.sign(
    { purpose: "google-link", portal, sub: String(byEmail._id), googleId: identity.sub },
    googleTxnKey(),
    { expiresIn: `${env().GOOGLE_LINK_CONFIRM_TTL_HOURS}h` },
  );
  const confirmUrl = `${env().WEB_BASE_URL}/auth/confirm-google-link?portal=${portal}&token=${encodeURIComponent(token)}`;
  dispatch(
    sendRendered(
      byEmail.email,
      renderGoogleLinkEmail(confirmUrl, env().GOOGLE_LINK_CONFIRM_TTL_HOURS),
    ),
  );
  logger.info({ accountId: String(byEmail._id), portal }, "google link step-up required");
  return { kind: "link-pending" };
}

/**
 * Redeems the mailed confirmation. The token alone is not enough: the STORED
 * pending request must still match it, so a newer link attempt (different
 * Google account) silently invalidates every older mail, and a cleared pending
 * (takeover, cancellation) invalidates them all.
 */
export async function confirmGoogleLink(portal: Portal, token: string): Promise<void> {
  const invalid = AppError.badRequest(
    "GOOGLE_LINK_INVALID",
    "That confirmation link is invalid or has expired.",
  );

  let claims: { purpose?: string; portal?: Portal; sub?: string; googleId?: string };
  try {
    claims = jwt.verify(token, googleTxnKey()) as typeof claims;
  } catch {
    throw invalid;
  }
  if (
    claims.purpose !== "google-link" ||
    claims.portal !== portal ||
    !claims.sub ||
    !claims.googleId
  ) {
    throw invalid;
  }

  const cutoff = new Date(Date.now() - env().GOOGLE_LINK_CONFIRM_TTL_HOURS * 3_600_000);
  try {
    const linked = await accountModel(portal).findOneAndUpdate(
      {
        _id: claims.sub,
        "pendingGoogleLink.googleId": claims.googleId,
        "pendingGoogleLink.requestedAt": mongoose.trusted({ $gt: cutoff }),
        googleId: null,
      },
      {
        $set: {
          googleId: claims.googleId,
          pendingGoogleLink: { googleId: null, requestedAt: null },
        },
      },
      { new: true },
    );
    if (!linked) throw invalid;
  } catch (error) {
    // The Google identity got linked to a DIFFERENT account meanwhile; the
    // partial unique index on googleId refuses the alias. Same uniform error.
    if ((error as { code?: number }).code === 11000) throw invalid;
    throw error;
  }
}
