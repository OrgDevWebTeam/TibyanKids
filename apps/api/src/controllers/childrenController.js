import Child from "../Models/Child.js";
import { auditIfOtherFamily } from "../utils/auditCrossFamily.js";

async function findMyChild(req) {
  const child = await Child.findOwned(req.params.id, req.family._id).where("status").ne("archived");
  if (!child) await auditIfOtherFamily(req, req.params.id);
  return child;
}

export async function createChild(req, res) {
  const child = await Child.create({
    ...req.body,
    familyId: req.family._id,
  });

  res.status(201).json({ status: "success", child });
}

export async function listChildren(req, res) {
  const children = await Child.find({
    familyId: req.family._id,
    status: { $ne: "archived" },
  }).sort({ createdAt: -1 });

  res.status(200).json({ status: "success", count: children.length, children });
}

export async function getChild(req, res) {
  const child = await findMyChild(req);

  if (!child) {
    return res.status(404).json({ status: "fail", message: "Child not found" });
  }

  res.status(200).json({ status: "success", child });
}

export async function updateChild(req, res) {
  const child = await findMyChild(req);

  if (!child) {
    return res.status(404).json({ message: "Child not found" });
  }

  child.set(req.body);
  await child.save();

  res.status(200).json({ status: "success", child });
}

export async function archiveChild(req, res) {
  const child = await findMyChild(req);

  if (!child) {
    return res.status(404).json({ message: "Child not found" });
  }

  child.status = "archived";
  await child.save();

  res.status(200).json({ status: "success", child });
}
