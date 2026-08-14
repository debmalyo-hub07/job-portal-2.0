import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { AppError } from "../lib/AppError.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;

type TurnstileResponse = {
  success?: boolean;
  action?: string;
};

export async function verifyTurnstile(
  token: string,
  remoteIp: string | undefined,
  secret: string,
  fetchImpl: typeof fetch = fetch,
  expectedAction?: string,
): Promise<boolean> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetchImpl(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;

    const result = (await response.json()) as TurnstileResponse;
    if (result.success !== true) return false;
    return expectedAction === undefined || result.action === expectedAction;
  } catch {
    return false;
  }
}

/**
 * Cloudflare Turnstile is required in production and optional locally. The
 * secret is server-only; the browser sends only the short-lived challenge
 * response in a header that is never logged.
 */
export function botProtection(action: string) {
  return async function botProtectionMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const secret = env().TURNSTILE_SECRET_KEY;
    if (!secret) {
      next();
      return;
    }

    const token = req.get("x-turnstile-token");
    const valid = token
      ? await verifyTurnstile(token, req.ip, secret, fetch, action)
      : false;
    if (!valid) {
      next(
        AppError.forbidden(
          "BOT_VERIFICATION_FAILED",
          "Verification failed. Refresh the challenge and try again.",
        ),
      );
      return;
    }
    next();
  };
}
