import "express";

declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user's id, set by `isAuthenticated`.
       *
       * Phase 1B replaces this with a typed `req.user`. Until then it stays
       * optional, because most routes run without authentication and a
       * non-optional field would be a lie the compiler cannot catch.
       */
      id?: string;
    }
  }
}

export {};
