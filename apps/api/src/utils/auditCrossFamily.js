import Child from "../Models/Child.js";
import { recordAudit } from "./audit.js";

/**
 * Call this when a child lookup came back empty.
 * If the child exists but belongs to ANOTHER family, write an access.denied event.
 * The caller still answers 404, so the response gives nothing away.
 */
export async function auditIfOtherFamily(req, childId) {
  try {
    // $eq makes sure the id is only ever compared as a value, never read as a query operator.
    const child = await Child.findOne({ _id: { $eq: childId } }).select("familyId");
    if (child && !child.familyId.equals(req.family._id)) {
      await recordAudit({
        actor: req.user,
        action: "access.denied",
        result: "denied",
        target: { type: "Child", id: child._id },
        meta: { reason: `${req.method} ${req.baseUrl}`.slice(0, 200) },
      });
    }
  } catch (error) {
    // A failed audit write must never change the answer the user gets.
    console.error("Failed to record audit event:", error.message);
  }
}
