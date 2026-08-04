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
       * Authenticated subject, set by `authenticate(portal)` on the auth routes
       * or `bridgeAuth` on the inherited domain routes.
       *
       * This is the real contract. A bare string id could not express *which
       * collection* it came from, so every downstream check had to carry the
       * portal separately — and the one place that forgot is the whole bug class
       * Phase 1B exists to close.
       */
      auth?: {
        id: string;
        portal: Portal;
        emailVerified: boolean;
      };

      /**
       * KEPT UNTIL PHASE 1C. Authenticated subject's id, set by `bridgeAuth`
       * from `req.auth.id`.
       *
       * The inherited domain controllers (`updateProfile`, `postJob`,
       * `getAdminJobs`, `applyJob`, …) read this, so the bridge keeps populating
       * it and they keep working unchanged.
       *
       * Do not add new readers. It cannot express a portal, which is exactly why
       * `auth` exists; 1C moves those controllers onto `auth` and this goes with
       * them.
       */
      id?: string;
    }
  }
}

export {};
