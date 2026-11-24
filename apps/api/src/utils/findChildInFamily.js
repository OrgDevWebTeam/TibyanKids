import Child from "../Models/Child.js";
import AppError from "./AppError.js";
import { auditIfOtherFamily } from "./auditCrossFamily.js";

// A child by id, but only if it belongs to the signed-in parent's family and is not archived.
// Another family's child gets the same 404 as a child that does not exist, and the attempt is
// written to the audit log (matrix rule 6). Use it after loadFamily.
export async function findChildInFamily(req, childId) {
  // $eq makes sure the id is only ever compared as a value, never read as a query operator.
  const child = await Child.findOne({
    _id: { $eq: String(childId) },
    familyId: req.family._id,
    status: { $ne: "archived" },
  });

  if (!child) {
    await auditIfOtherFamily(req, childId);
    throw new AppError(404, "Child not found");
  }
  return child;
}
