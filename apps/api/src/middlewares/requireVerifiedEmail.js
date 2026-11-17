import { recordAudit } from "../utils/audit.js";

/** FR-AUTH-001: an unverified parent cannot start a child's journey. */
export default async function requireVerifiedEmail(req, res, next) {
  if (req.user.emailVerified) {
    return next();
  }

  try {
    await recordAudit({
      actor: req.user,
      action: "access.denied",
      result: "denied",
      meta: { reason: "email not verified" },
    });
  } catch (error) {
    console.error("Failed to record audit event:", error.message);
  }

  return res
    .status(403)
    .json({ status: "fail", message: "Verify your email address before continuing" });
}
