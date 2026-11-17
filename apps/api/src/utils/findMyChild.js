import Child from "../Models/Child.js";

// The child in the URL (:id) if it belongs to the parent's family and is not archived.
// The same "not found" for a missing child and another family's child.
export function findMyChild(req) {
  return Child.findOwned(req.params.id, req.family._id).where("status").ne("archived");
}
