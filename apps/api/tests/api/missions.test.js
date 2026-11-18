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

describe("family loop endpoints (FR-FAM-001 to FR-FAM-003, API-005)", () => {
  let owner;
  let other;
  let child;
  let competency;
  let first;
  let second;

  const missions = (token, id = child._id) => api(`/children/${id}/missions`, { token });
  const observe = (token, assignmentId, body, id = child._id) =>
    api(`/children/${id}/missions/${assignmentId}/observe`, { method: "POST", token, body });
  const reflect = (token, assignmentId, body, id = child._id) =>
    api(`/children/${id}/missions/${assignmentId}/reflect`, { method: "POST", token, body });

  const makeMission = (title) =>
    Content.create({
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

    competency = await Competency.create({
      domain: "quran",
      code: "FL-1",
      name: { ar: "أ", en: "One" },
    });
    await makeMission("Read together");
    await makeMission("Say it at dinner");

    // Missions are assigned by the system, so the test does it directly
    const childDoc = await Child.findById(child._id);
    first = await assignMission(childDoc);
    second = await assignMission(childDoc);
    assert.ok(first && second);
  });
  after(stopTestApp);

  it("needs a signed-in parent", async () => {
    assert.equal((await missions(undefined)).status, 401);
    assert.equal((await observe(undefined, first._id, { status: "independent" })).status, 401);
    const staff = await makeStaff("content_admin");
    assert.equal((await missions(staff.token)).status, 403);
  });

  it("lists the child's missions with their status", async () => {
    const res = await missions(owner.token);
    assert.equal(res.status, 200);
    assert.equal(res.json.count, 2);
    for (const mission of res.json.missions) {
      assert.equal(mission.status, "pending");
      assert.ok(mission.mission.title);
      assert.equal(mission.observation, null);
    }
  });

  it("records an observation, and the Growth Map shows it as evidence", async () => {
    const res = await observe(owner.token, first._id, {
      status: "independent",
      note: "Did it alone",
      clientObservationId: "retry-1",
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.duplicate, false);
    assert.equal(res.json.evidenceRecorded, 1);
    assert.equal(res.json.observation.note, "Did it alone");

    const growth = await api(`/children/${child._id}/growth`, { token: owner.token });
    const quran = growth.json.domains.find((d) => d.domain === "quran");
    assert.equal(quran.status, "assessed");
    assert.equal(growth.json.recentEvidence[0].sourceType, "observation");
    assert.equal(growth.json.recentEvidence[0].result, "met");
  });

  it("a repeated request with the same clientObservationId is answered, not saved twice", async () => {
    const res = await observe(owner.token, first._id, {
      status: "independent",
      clientObservationId: "retry-1",
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.duplicate, true);
    assert.equal(await EvidenceEvent.countDocuments({ sourceType: "observation" }), 1);
  });

  it("refuses a second observation of the same mission", async () => {
    const res = await observe(owner.token, first._id, { status: "reminder" });
    assert.equal(res.status, 409);
  });

  it("not observed completes the mission and adds no evidence", async () => {
    const before = await EvidenceEvent.countDocuments();
    const res = await observe(owner.token, second._id, { status: "not_observed" });
    assert.equal(res.status, 201);
    assert.equal(res.json.evidenceRecorded, 0);
    assert.equal(await EvidenceEvent.countDocuments(), before);
  });

  it("saves the child's reflection once", async () => {
    const res = await reflect(owner.token, first._id, { choice: "proud" });
    assert.equal(res.status, 201);
    assert.equal(res.json.duplicate, false);
    assert.equal(res.json.reflection.choice, "proud");

    // The same choice again is a safe retry; a different one is refused
    const again = await reflect(owner.token, first._id, { choice: "proud" });
    assert.equal(again.status, 200);
    assert.equal(again.json.duplicate, true);
    assert.equal(again.json.reflection.id, res.json.reflection.id);
    assert.equal((await reflect(owner.token, first._id, { choice: "want_more" })).status, 409);

    const list = await missions(owner.token);
    const item = list.json.missions.find((m) => m.id === String(first._id));
    assert.equal(item.status, "completed");
    assert.equal(item.reflection.choice, "proud");
  });

  it("refuses bad input with a 400", async () => {
    const cases = [
      [observe, { status: "perfect" }],
      [observe, {}],
      [observe, { status: "independent", note: "x".repeat(501) }],
      [observe, { status: "independent", childId: String(child._id) }],
      [observe, { status: "independent", weight: 1 }],
      [reflect, { choice: "I hate it" }],
      [reflect, { choice: "proud", comment: "fun" }],
    ];
    for (const [call, body] of cases) {
      assert.equal((await call(owner.token, second._id, body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await observe(owner.token, "not-an-id", { status: "independent" })).status, 400);
  });

  it("another family cannot see or change the missions, and the attempt is audited", async () => {
    const attempts = [
      missions(other.token),
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

  it("a parent cannot use another family's mission id on their own child", async () => {
    const otherChild = await createChild(other.token);
    const res = await observe(other.token, second._id, { status: "independent" }, otherChild._id);
    assert.equal(res.status, 404);
  });
});
