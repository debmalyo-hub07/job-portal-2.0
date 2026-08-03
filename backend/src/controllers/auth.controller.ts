import type { RequestHandler } from "express";
import {
  registerBodySchema,
  resendVerificationBodySchema,
  verifyEmailBodySchema,
  type Portal,
} from "@jobportal/shared";
import { parseBody } from "../lib/validate.js";
import { issueSession } from "../services/session.service.js";
import * as auth from "../services/auth.service.js";

/**
 * Every handler is a factory taking the portal as a server-side literal from
 * the mount (Task 10 passes it when building the router). Nothing in this file
 * reads a portal, a role, or an account id from the request payload.
 */
export function registerHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const body = parseBody(registerBodySchema, req.body);
    await auth.register(portal, body);
    res.status(201).json({
      success: true,
      message: "Account created. Enter the code we just emailed you.",
    });
  };
}

export function verifyEmailHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { email, code } = parseBody(verifyEmailBodySchema, req.body);
    const account = await auth.verifyEmail(portal, email, code);
    await issueSession(res, req, account._id, portal);
    res.json({ success: true, user: auth.toSessionUser(portal, account) });
  };
}

export function resendCodeHandler(portal: Portal): RequestHandler {
  return async (req, res) => {
    const { email } = parseBody(resendVerificationBodySchema, req.body);
    await auth.resendVerification(portal, email);
    res.json({
      success: true,
      message: "If that address has an unverified account, a new code is on its way.",
    });
  };
}
