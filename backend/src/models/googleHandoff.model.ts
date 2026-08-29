import { PORTALS } from "@jobportal/shared";
import { Schema, type InferSchemaType, type Model } from "mongoose";
import { defineModel } from "./defineModel.js";

/**
 * One-time session handoff from the Google callback to the SPA.
 *
 * Why this collection exists at all: the callback is a top-level navigation to
 * the API host, and the web app is on a different registrable domain. A cookie
 * SET on that navigation is stored against the API host as a first party, and
 * the browser then does not present it on the SPA's cross-site XHR — measured
 * in production, where the callback signed a seeker in three times and every
 * following `/me` arrived with no cookie at all. Cookies set on the SPA's OWN
 * request (password login, refresh rotation) are stored and sent normally.
 *
 * So the callback stops issuing the session and mints one of these rows
 * instead. The SPA redeems the code over a request it makes itself, and the
 * session cookies land on the only path this deployment has ever delivered
 * them on. See docs/adr/0009-google-sign-in.md.
 */
const googleHandoffSchema = new Schema(
  {
    /**
     * HMAC-SHA256 of the code under a derived key — never the code itself,
     * exactly like `refreshToken.tokenHash`. The code is 32 random bytes, so
     * a rainbow table is not the threat; a *dump* of this collection is, and
     * a keyed hash makes one useless without the env secret.
     */
    tokenHash: { type: String, required: true, unique: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    /**
     * The portal the code was minted for, enforced in the redemption query so
     * a seeker's code presented to the recruiter exchange fails the lookup
     * before any account is read. Admin never appears here: the admin router
     * mounts no Google routes and the callback refuses that portal twice over.
     */
    subjectType: { type: String, enum: PORTALS, required: true },
    expiresAt: { type: Date, required: true },
    /**
     * Set by the redemption itself, in the same atomic `findOneAndUpdate` that
     * matches on `consumedAt: null`. Single-use is therefore a property of one
     * document write rather than of a read-then-write the second tab can win.
     */
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The redemption query, and the sweeper Mongo runs for us. `unique` on
// tokenHash already indexes it; this is the compound the lookup actually uses.
googleHandoffSchema.index({ tokenHash: 1, subjectType: 1 });
googleHandoffSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type GoogleHandoffDocument = InferSchemaType<typeof googleHandoffSchema>;
export const GoogleHandoff: Model<GoogleHandoffDocument> =
  defineModel<GoogleHandoffDocument>("GoogleHandoff", googleHandoffSchema);
