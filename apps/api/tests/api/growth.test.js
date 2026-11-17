import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import AuditEvent from "../../src/Models/AuditEvent.js";
import Competency from "../../src/Models/Competency.js";
import { DOMAINS } from "../../src/constants/index.js";
import { recordEvidence } from "../../src/growth/growthService.js";
import {
  startTestApp,
  stopTestApp,
  api,
  registerParent,
  createChild,
  makeStaff,
} from "../helpers/api.js";

describe("growth map endpoint (API-004, FR-GRW-001, FR-GRW-003)", () => {
  let owner;
  let other;
  let child;
  let q1;
  let growth;

  const read = (token, id = child._id) => api(`/children/${id}/growth`, { token });
  const evidence = (competency, overrides = {}) =>
    recordEvidence({
      familyId: owner.familyId,
      childId: child._id,
      competencyId: competency._id,
      sourceType: "activity",
      weight: 0.5,
      result: "met",
      ...overrides,
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

    q1 = await Competency.create({ domain: "quran", code: "Q-1", name: { ar: "أ", en: "One" } });
    await Competency.create({ domain: "quran", code: "Q-2", name: { ar: "ب", en: "Two" } });
    await Competency.create({ domain: "arabic", code: "A-1", name: { ar: "ج", en: "Three" } });
  });
  after(stopTestApp);

  it("lists all five domains as not assessed for a child with no evidence", async () => {
    const res = await read(owner.token);
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.json.domains.map((d) => d.domain),
      DOMAINS,
    );
    for (const domain of res.json.domains) {
      assert.equal(domain.status, "not_assessed");
      assert.equal(domain.level, null);
      assert.equal(domain.confidence, null);
    }
    const byName = Object.fromEntries(res.json.domains.map((d) => [d.domain, d]));
    assert.equal(byName.quran.totalCompetencies, 2);
    assert.equal(byName.arabic.totalCompetencies, 1);
    assert.equal(byName.faith.totalCompetencies, 0);
    assert.deepEqual(res.json.recentEvidence, []);
  });

  it("shows the level, confidence, next goal and recent evidence once there is evidence", async () => {
    for (let i = 0; i < 3; i += 1) await evidence(q1);

    const res = await read(owner.token);
    growth = Object.fromEntries(res.json.domains.map((d) => [d.domain, d]));

    assert.equal(growth.quran.status, "assessed");
    assert.equal(growth.quran.level, 4);
    assert.equal(growth.quran.confidence, "medium");
    assert.equal(growth.quran.assessedCompetencies, 1);
    assert.equal(growth.quran.nextGoal.code, "Q-2"); // the one never assessed
    assert.equal(growth.arabic.status, "not_assessed"); // untouched domains stay not assessed
    assert.equal(growth.faith.status, "not_assessed");

    const states = Object.fromEntries(growth.quran.competencies.map((c) => [c.code, c]));
    assert.equal(states["Q-1"].level, 4);
    assert.equal(states["Q-2"].status, "not_assessed");
    assert.equal(states["Q-2"].level, null);

    assert.equal(res.json.recentEvidence.length, 3);
    for (const item of res.json.recentEvidence) {
      assert.deepEqual(Object.keys(item).sort(), [
        "competencyId",
        "domain",
        "occurredAt",
        "result",
        "sourceType",
      ]);
    }
  });

  it("does not show a family id or any other family's data", async () => {
    const res = await read(owner.token);
    assert.ok(!JSON.stringify(res.json).includes(owner.familyId));
  });

  it("gives another family a 404 and logs the attempt", async () => {
    const res = await read(other.token);
    assert.equal(res.status, 404);

    const events = await AuditEvent.find({
      action: "access.denied",
      actorId: other.userId,
      targetId: child._id,
    });
    assert.equal(events.length, 1);
  });

  it("refuses anonymous users and staff", async () => {
    assert.equal((await api(`/children/${child._id}/growth`)).status, 401);
    const staff = await makeStaff("platform_admin");
    assert.equal((await read(staff.token)).status, 403);
  });
});
