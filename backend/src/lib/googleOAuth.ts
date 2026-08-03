import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { env } from "../config/env.js";

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
  avatarUrl: string | null;
  /** Echoed from the ID token. The LIBRARY DOES NOT CHECK IT; the service must. */
  nonce: string | null;
}

export interface GoogleOAuthPort {
  authUrl(input: {
    redirectUri: string;
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string;
  exchange(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<GoogleIdentity>;
}

/** Lazy for the same env()-at-import reason as the mailer (Task 4). */
let client: OAuth2Client | undefined;
function oauthClient(): OAuth2Client {
  client ??= new OAuth2Client({
    clientId: env().GOOGLE_CLIENT_ID,
    clientSecret: env().GOOGLE_CLIENT_SECRET,
  });
  return client;
}

const realGoogleOAuth: GoogleOAuthPort = {
  authUrl({ redirectUri, state, nonce, codeChallenge }) {
    return oauthClient().generateAuthUrl({
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "online",
      scope: ["openid", "email", "profile"],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: "select_account",
      // generateAuthUrl serialises every key into the query string, but its
      // options type does not declare `nonce`; the cast is confined to it.
      ...({ nonce } as Record<string, string>),
    });
  },

  async exchange({ code, codeVerifier, redirectUri }) {
    // PKCE verifier AND client_secret travel together: Google's web client
    // type requires the secret, and only the verifier stops an injected code
    // (RFC 9700 §2.1.1). getToken sends both.
    const { tokens } = await oauthClient().getToken({
      code,
      codeVerifier,
      redirect_uri: redirectUri,
    });
    if (!tokens.id_token) throw new Error("Google token response carried no id_token");

    // `audience` passed EXPLICITLY. The library only checks `aud` when given
    // one; omitting it accepts any Google-signed token minted for any
    // application on earth — a full authentication bypass.
    const ticket = await oauthClient().verifyIdToken({
      idToken: tokens.id_token,
      audience: env().GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new Error("Google id_token missing sub or email");

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      fullName: payload.name ?? null,
      avatarUrl: payload.picture ?? null,
      nonce: (payload as { nonce?: string }).nonce ?? null,
    };
  },
};

let active: GoogleOAuthPort = realGoogleOAuth;

export function googleOAuth(): GoogleOAuthPort {
  return active;
}

/** Test seam, mirror of setMailer. No auth test may ever reach Google. */
export function setGoogleOAuth(next: GoogleOAuthPort): void {
  active = next;
}

export function resetGoogleOAuth(): void {
  active = realGoogleOAuth;
}
