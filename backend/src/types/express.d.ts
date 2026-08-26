import "express";
import type { Portal } from "@jobportal/shared";

declare global {
  namespace Express {
    interface Request {
      /**
       * Per-request correlation id, set by the `requestId` middleware.
       */
      requestId?: string;

      /**
       * Authenticated subject, set by `authenticate(portal)`, `authenticateAny()`
       * or `optionalAuthenticate()`.
       *
       * This is the whole contract. A bare string id could not express *which
       * collection* it came from, so every downstream check had to carry the
       * portal separately — and the one place that forgot is the whole bug class
       * Phase 1B exists to close.
       */
      auth?: {
        id: string;
        portal: Portal;
        emailVerified: boolean;
        /**
         * Set by `authenticate` and `authenticateAny`, both of which already
         * fetch the account — so the gate needs no second query. Same reasoning
         * as `emailVerified` above; `requireApproved` re-reads the account only
         * because `status` never made it onto this object.
         */
        profileComplete: boolean;
      };
    }
  }
}

export {};
