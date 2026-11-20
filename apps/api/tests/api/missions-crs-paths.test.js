import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditEvent from "../../src/Models/AuditEvent.js";
import Child from "../../src/Models/Child.js";
import Competency from "../../src/Models/Competency.js";
import Content from "../../src/Models/Content.js";
import EvidenceEvent from "../../src/Models/EvidenceEvent.js";
import { assignMission } from "../../src/missions/missionService.js";
import {
  startTestApp,
  stopTestApp,
  api,
  registerParent,
  createChild,
  makeStaff,
} from "../helpers/api.js";

const newId = () => new mongoose.Types.ObjectId();

// The family mission paths as the CRS lists them (API-005): /missions, /missions/{id}/observe, /reflect
describe("family missions on the CRS paths (API-005)", () => {
  let owner;
  let other;
  let child;
  let first;
  let second;

  const list = (token, childId = child._id) => api(`/missions?childId=${childId}`, { token });
  const observe = (token, assignmentId, body) =>
    api(`/missions/${assignmentId}/observe`, { method: "POST", token, body });
  const reflect = (token, assignmentId, body) =>
    api(`/missions/${assignmentId}/reflect`, { method: "POST", token, body });

  before(async () => {
    await startTestApp();
    owner = await registerParent();
    other = await registerParent();

    child = await createChild(owner.token);
    const granted = await api("/consents", {
      method: "POST",
      token: owner.token,
      body: { childId: child._id, status: "granted", policyVersion: "v1" },
    });
    assert.equal(granted.status, 201);

    const competency = await Competency.create({
      domain: "quran",
      code: "CP-1",
      name: { ar: "أ", en: "One" },
    });
    for (const title of ["Read together", "Say it at dinner"]) {
      await Content.create({
        title,
        type: "mission",
        ageBand: "9-11", // createChild makes a nine-year-old
        language: "ar",
        domain: "quran",
        level: 1,
        estimatedMinutes: 5,
        competencies: [competency._id],
        createdBy: newId(),
        reviewedBy: newId(),
        approvedAt: new Date(),
        status: "published",
      });
    }
    const childDoc = await Child.findById(child._id);
    first = await assignMission(childDoc);
    second = await assignMission(childDoc);
    assert.ok(first && second);
  });
  after(stopTestApp);

  it("needs a signed-in parent", async () => {
    assert.equal((await list(undefined)).status, 401);
    assert.equal((await observe(undefined, first._id, { status: "independent" })).status, 401);
    const staff = await makeStaff("content_admin");
    assert.equal((await list(staff.token)).status, 403);
  });

  it("GET /missions lists the child's missions", async () => {
    const res = await list(owner.token);
    assert.equal(res.status, 200);
    assert.equal(res.json.count, 2);
    assert.equal(res.json.missions[0].status, "pending");
  });

  it("GET /missions needs a valid childId and nothing else", async () => {
    assert.equal((await api("/missions", { token: owner.token })).status, 400);
    assert.equal((await api("/missions?childId=nope", { token: owner.token })).status, 400);
    const extra = await api(`/missions?childId=${child._id}&familyId=${newId()}`, {
      token: owner.token,
    });
    assert.equal(extra.status, 400);
  });

  it("observes a mission by its own id, and records evidence", async () => {
    const res = await observe(owner.token, first._id, {
      status: "reminder",
      clientObservationId: "crs-1",
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.evidenceRecorded, 1);

    const again = await observe(owner.token, first._id, {
      status: "reminder",
      clientObservationId: "crs-1",
    });
    assert.equal(again.status, 200);
    assert.equal(again.json.duplicate, true);
    assert.equal(await EvidenceEvent.countDocuments({ sourceType: "observation" }), 1);

    assert.equal((await observe(owner.token, first._id, { status: "independent" })).status, 409);
  });

  it("reflects on a mission by its own id, and a repeat is safe", async () => {
    const res = await reflect(owner.token, first._id, { choice: "proud" });
    assert.equal(res.status, 201);

    const again = await reflect(owner.token, first._id, { choice: "proud" });
    assert.equal(again.status, 200);
    assert.equal(again.json.duplicate, true);
    assert.equal(again.json.reflection.id, res.json.reflection.id);

    assert.equal((await reflect(owner.token, first._id, { choice: "was_hard" })).status, 409);
  });

  it("refuses bad input and a bad id with a 400", async () => {
    assert.equal((await observe(owner.token, second._id, { status: "perfect" })).status, 400);
    assert.equal(
      (await observe(owner.token, second._id, { status: "independent", weight: 1 })).status,
      400,
    );
    assert.equal((await reflect(owner.token, second._id, { choice: "I hate it" })).status, 400);
    assert.equal((await observe(owner.token, "not-an-id", { status: "independent" })).status, 400);
  });

  it("another family gets 404 everywhere, and every attempt is audited", async () => {
    const attempts = [
      list(other.token), // someone else's child
      observe(other.token, second._id, { status: "independent" }),
      reflect(other.token, second._id, { choice: "proud" }),
    ];
    for (const res of await Promise.all(attempts)) assert.equal(res.status, 404);

    const denied = await AuditEvent.countDocuments({
      action: "access.denied",
      targetId: child._id,
    });
    assert.equal(denied, 3);
  });

  it("an unknown mission id is a 404", async () => {
    assert.equal((await observe(owner.token, newId(), { status: "independent" })).status, 404);
  });
});
