import { Admin } from "../models/admin.model.js";
import { Recruiter } from "../models/recruiter.model.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { dispatch, sendRendered } from "../lib/mailer.js";
import { renderAdminPendingEmail } from "../lib/emailTemplates.js";

/**
 * P1 of the console automation program: tell every active admin that a
 * pending recruiter just became real work.
 *
 * The whole function is fire-and-forget by contract — a notification is a
 * courtesy, and the verification that triggered it is the product, so
 * nothing here may reject into a caller that otherwise succeeded. Two layers
 * hold that up: the outer try/catch (a query or render failure logs and
 * stops), and one `dispatch()` per recipient (a bounce for one admin neither
 * blocks the other sends nor touches the request). This is the opposite
 * posture from invite-admin, where the email IS the deliverable and a mail
 * failure fails the request.
 *
 * The pending count uses the queue's own filter — `{ status: "pending" }` —
 * so the number in the mail matches the number the admin sees on the screen
 * the link opens.
 */
export async function notifyAdminsOfPendingRecruiter(recruiter: {
  fullName: string;
  email: string;
}): Promise<void> {
  try {
    const [admins, pendingCount] = await Promise.all([
      Admin.find({ status: "active" }).select("email"),
      Recruiter.countDocuments({ status: "pending" }),
    ]);
    const rendered = renderAdminPendingEmail(
      recruiter.fullName,
      recruiter.email,
      pendingCount,
      `${env().WEB_BASE_URL}/admin/recruiters`,
    );
    for (const admin of admins) {
      dispatch(sendRendered(admin.email, rendered));
    }
  } catch (error) {
    logger.error({ err: error }, "admin notification failed");
  }
}
