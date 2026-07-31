import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { AppError } from "../lib/AppError.js";
import { env } from "../config/env.js";

const isAuthenticated = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.cookies.token;
    if (!token) {
      next(AppError.unauthorized("NOT_AUTHENTICATED", "User not authenticated"));
      return;
    }
    const decode = jwt.verify(token, env().JWT_ACCESS_SECRET) as JwtPayload;
    if (!decode) {
      next(AppError.unauthorized("INVALID_TOKEN", "Invalid token"));
      return;
    }
    req.id = decode.userId;
    next();
  } catch {
    // A malformed or expired token is a 401, not a 500. Previously this was
    // logged and swallowed, leaving the request hanging until client timeout.
    next(AppError.unauthorized("INVALID_TOKEN", "Invalid token"));
  }
};
export default isAuthenticated;
