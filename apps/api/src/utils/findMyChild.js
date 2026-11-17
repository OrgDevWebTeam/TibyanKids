import Child from "../Models/Child.js";
import { auditIfOtherFamily } from "./auditCrossFamily.js";

// The child in the URL (:id) if it belongs to the parent's family and is not archived.
// The same "not found" for a missing child and another family's child.
// Another family's child is also written to the audit log (matrix rule 6).
export async function findMyChild(req) {
  const child = await Child.findOwned(req.params.id, req.family._id).where("status").ne("archived");
  if (!child) await auditIfOtherFamily(req, req.params.id);
  return child;
}
