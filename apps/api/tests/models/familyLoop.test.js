import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Family from "../../src/Models/Family.js";
import Child from "../../src/Models/Child.js";
import MissionAssignment from "../../src/Models/MissionAssignment.js";
import ParentObservation from "../../src/Models/ParentObservation.js";
import ChildReflection from "../../src/Models/ChildReflection.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "../helpers/db.js";

const newId = () => new mongoose.Types.ObjectId();

const makeFamily = () => Family.create({ name: "Test family", parentId: newId() });
const makeChild = (family, status = "active") =>
  Child.create({
    name: "Ahmad",
    dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 8, 0, 1)),
    familyId: family._id,
    status,
  });

const assignmentFor = (child, overrides = {}) => ({
  familyId: child.familyId,
  childId: child._id,
  missionId: newId(),
  ...overrides,
});

const rejectsWith = (promise, field) =>
  assert.rejects(
    promise,
    (err) => err.name === "ValidationError" && Boolean(err.errors[field]),
    `expected a validation error on ${field}`,
  );

describe("family loop models (FR-FAM-001 to FR-FAM-003)", () => {
  before(async () => {
    await connectTestDb();
    await Promise.all([MissionAssignment.init(), ParentObservation.init(), ChildReflection.init()]);
  });
  after(disconnectTestDb);
  beforeEach(clearTestDb);

  it("an assignment gets its expiry date from the rules, 7 days after it is assigned", async () => {
    const child = await makeChild(await makeFamily());
    const a = await MissionAssignment.create(assignmentFor(child));
    const days = (a.expiresAt - a.assignedAt) / (24 * 60 * 60 * 1000);
    assert.equal(days, 7);
  });

  it("refuses an assignment for a child from another family", async () => {
    const child = await makeChild(await makeFamily());
    const other = await makeFamily();
    await rejectsWith(
      MissionAssignment.create(assignmentFor(child, { familyId: other._id })),
      "familyId",
    );
  });

  it("refuses an assignment for a child that is not active", async () => {
    const child = await makeChild(await makeFamily(), "pending_consent");
    await rejectsWith(MissionAssignment.create(assignmentFor(child)), "childId");
  });

  it("one completed lesson triggers only one mission for a child", async () => {
    const child = await makeChild(await makeFamily());
    const sourceProgressId = newId();
    await MissionAssignment.create(assignmentFor(child, { sourceProgressId }));
    await assert.rejects(
      MissionAssignment.create(assignmentFor(child, { sourceProgressId })),
      (err) => err.code === 11000,
    );
  });

  it("saves an observation and refuses a second one for the same mission", async () => {
    const child = await makeChild(await makeFamily());
    const a = await MissionAssignment.create(assignmentFor(child));
    const observation = {
      familyId: child.familyId,
      childId: child._id,
      assignmentId: a._id,
      observedBy: newId(),
      status: "independent",
    };
    await ParentObservation.create(observation);
    await assert.rejects(ParentObservation.create(observation), (err) => err.code === 11000);
  });

  it("refuses an unknown observation status and a note that is too long", async () => {
    const child = await makeChild(await makeFamily());
    const a = await MissionAssignment.create(assignmentFor(child));
    const base = {
      familyId: child.familyId,
      childId: child._id,
      assignmentId: a._id,
      observedBy: newId(),
    };
    await rejectsWith(ParentObservation.create({ ...base, status: "perfect" }), "status");
    await rejectsWith(
      ParentObservation.create({ ...base, status: "reminder", note: "x".repeat(501) }),
      "note",
    );
  });

  it("an observation cannot be edited afterwards", async () => {
    const child = await makeChild(await makeFamily());
    const a = await MissionAssignment.create(assignmentFor(child));
    const o = await ParentObservation.create({
      familyId: child.familyId,
      childId: child._id,
      assignmentId: a._id,
      observedBy: newId(),
      status: "reminder",
    });
    o.status = "independent";
    await o.save();
    const saved = await ParentObservation.findById(o._id);
    assert.equal(saved.status, "reminder");
  });

  it("a reflection must be one of the fixed choices", async () => {
    const child = await makeChild(await makeFamily());
    const a = await MissionAssignment.create(assignmentFor(child));
    const base = { familyId: child.familyId, childId: child._id, assignmentId: a._id };
    await rejectsWith(ChildReflection.create({ ...base, choice: "I hate it" }), "choice");
    await ChildReflection.create({ ...base, choice: "proud" });
  });
});
