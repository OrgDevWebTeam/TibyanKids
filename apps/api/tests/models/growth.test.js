import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Family from "../../src/Models/Family.js";
import Child from "../../src/Models/Child.js";
import Competency from "../../src/Models/Competency.js";
import EvidenceEvent from "../../src/Models/EvidenceEvent.js";
import GrowthState from "../../src/Models/GrowthState.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "../helpers/db.js";

const newId = () => new mongoose.Types.ObjectId();
let codeCounter = 0;

const makeFamily = (name = "Test family") => Family.create({ name, parentId: newId() });

const makeChild = (family, status = "active") =>
  Child.create({
    name: "Ahmad",
    dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 8, 0, 1)),
    familyId: family._id,
    status,
  });

const makeCompetency = (overrides = {}) => {
  codeCounter += 1;
  return Competency.create({
    domain: "quran",
    code: `G-${codeCounter}`,
    name: { ar: "كفاءة", en: "Competency" },
    ...overrides,
  });
};

const evidenceFor = (child, competency, overrides = {}) => ({
  familyId: child.familyId,
  childId: child._id,
  competencyId: competency._id,
  sourceType: "activity",
  weight: 0.5,
  result: "met",
  ...overrides,
});

const stateFor = (child, competency, overrides = {}) => ({
  familyId: child.familyId,
  childId: child._id,
  competencyId: competency._id,
  ...overrides,
});

const rejectsWith = (promise, field) =>
  assert.rejects(
    promise,
    (err) => err.name === "ValidationError" && Boolean(err.errors[field]),
    `expected a validation error on ${field}`,
  );

describe("evidence events (FR-GRW-001)", () => {
  before(connectTestDb);
  after(disconnectTestDb);
  beforeEach(clearTestDb);

  it("saves evidence for an active child, and takes the domain from the competency", async () => {
    const child = await makeChild(await makeFamily());
    const competency = await makeCompetency({ domain: "arabic" });
    const saved = await EvidenceEvent.create(evidenceFor(child, competency));

    assert.equal(saved.domain, "arabic");
    assert.ok(saved.occurredAt instanceof Date);
  });

  it("rejects evidence for a child of another family", async () => {
    const familyA = await makeFamily("A");
    const familyB = await makeFamily("B");
    const child = await makeChild(familyA);
    const competency = await makeCompetency();
    await rejectsWith(
      EvidenceEvent.create(evidenceFor(child, competency, { familyId: familyB._id })),
      "familyId",
    );
  });

  it("rejects evidence for a child whose consent is still pending", async () => {
    const child = await makeChild(await makeFamily(), "pending_consent");
    const competency = await makeCompetency();
    await rejectsWith(EvidenceEvent.create(evidenceFor(child, competency)), "childId");
  });

  it("rejects an unknown or inactive competency", async () => {
    const child = await makeChild(await makeFamily());
    const inactive = await makeCompetency({ active: false });
    await rejectsWith(EvidenceEvent.create(evidenceFor(child, { _id: newId() })), "competencyId");
    await rejectsWith(EvidenceEvent.create(evidenceFor(child, inactive)), "competencyId");
  });

  it("rejects a weight outside 0 to 1, and unknown source types or results", async () => {
    const child = await makeChild(await makeFamily());
    const competency = await makeCompetency();
    await rejectsWith(
      EvidenceEvent.create(evidenceFor(child, competency, { weight: 1.5 })),
      "weight",
    );
    await rejectsWith(
      EvidenceEvent.create(evidenceFor(child, competency, { weight: -1 })),
      "weight",
    );
    await rejectsWith(
      EvidenceEvent.create(evidenceFor(child, competency, { sourceType: "guess" })),
      "sourceType",
    );
    await rejectsWith(
      EvidenceEvent.create(evidenceFor(child, competency, { result: "mastered" })),
      "result",
    );
  });

  it("is append-only: updates fail loudly and change nothing", async () => {
    const child = await makeChild(await makeFamily());
    const competency = await makeCompetency();
    const saved = await EvidenceEvent.create(evidenceFor(child, competency));

    await assert.rejects(
      EvidenceEvent.updateOne({ _id: saved._id }, { result: "not_met" }),
      /append-only/,
    );
    saved.result = "not_met";
    await assert.rejects(saved.save(), /append-only/);

    const stored = await EvidenceEvent.findById(saved._id);
    assert.equal(stored.result, "met");
  });
});

describe("growth states (FR-GRW-001)", () => {
  before(async () => {
    await connectTestDb();
    await GrowthState.init(); // the unique index must exist before the duplicate test
  });
  after(disconnectTestDb);
  beforeEach(clearTestDb);

  it("starts as not assessed, with no level and no confidence", async () => {
    const child = await makeChild(await makeFamily());
    const competency = await makeCompetency({ domain: "faith" });
    const state = await GrowthState.create(stateFor(child, competency));

    assert.equal(state.status, "not_assessed");
    assert.equal(state.level, null);
    assert.equal(state.confidence, null);
    assert.equal(state.evidenceCount, 0);
    assert.equal(state.domain, "faith");
  });

  it("keeps 'not assessed' apart from 'assessed with a low level'", async () => {
    const child = await makeChild(await makeFamily());
    const competencyA = await makeCompetency();
    const competencyB = await makeCompetency();

    const notAssessed = await GrowthState.create(stateFor(child, competencyA));
    const low = await GrowthState.create(
      stateFor(child, competencyB, {
        status: "assessed",
        level: 0,
        confidence: "low",
        evidenceCount: 1,
      }),
    );

    assert.notEqual(notAssessed.status, low.status);
    assert.equal(notAssessed.level, null);
    assert.equal(low.level, 0);
  });

  it("refuses a not-assessed state that carries a level, a confidence or evidence", async () => {
    const child = await makeChild(await makeFamily());
    const competency = await makeCompetency();
    await rejectsWith(GrowthState.create(stateFor(child, competency, { level: 2 })), "status");
    await rejectsWith(
      GrowthState.create(stateFor(child, competency, { confidence: "high" })),
      "status",
    );
    await rejectsWith(
      GrowthState.create(stateFor(child, competency, { evidenceCount: 1 })),
      "status",
    );
  });

  it("refuses an assessed state without a level, a confidence or evidence", async () => {
    const child = await makeChild(await makeFamily());
    const competency = await makeCompetency();
    const assessed = { status: "assessed", level: 2, confidence: "medium", evidenceCount: 3 };

    await rejectsWith(
      GrowthState.create(stateFor(child, competency, { ...assessed, level: null })),
      "level",
    );
    await rejectsWith(
      GrowthState.create(stateFor(child, competency, { ...assessed, confidence: null })),
      "confidence",
    );
    await rejectsWith(
      GrowthState.create(stateFor(child, competency, { ...assessed, evidenceCount: 0 })),
      "evidenceCount",
    );
    const ok = await GrowthState.create(stateFor(child, competency, assessed));
    assert.equal(ok.level, 2);
  });

  it("allows one state per child and competency", async () => {
    const child = await makeChild(await makeFamily());
    const competency = await makeCompetency();
    await GrowthState.create(stateFor(child, competency));
    await assert.rejects(
      GrowthState.create(stateFor(child, competency)),
      (err) => err.code === 11000,
    );
  });

  it("rejects a state for a child of another family or a child without consent", async () => {
    const familyA = await makeFamily("A");
    const familyB = await makeFamily("B");
    const child = await makeChild(familyA);
    const pending = await makeChild(familyA, "pending_consent");
    const competency = await makeCompetency();

    await rejectsWith(
      GrowthState.create(stateFor(child, competency, { familyId: familyB._id })),
      "familyId",
    );
    await rejectsWith(GrowthState.create(stateFor(pending, competency)), "childId");
  });

  it("needs an active competency as the next goal", async () => {
    const child = await makeChild(await makeFamily());
    const competency = await makeCompetency();
    const inactive = await makeCompetency({ active: false });

    await rejectsWith(
      GrowthState.create(stateFor(child, competency, { nextGoal: inactive._id })),
      "nextGoal",
    );
    const goal = await makeCompetency();
    const ok = await GrowthState.create(stateFor(child, competency, { nextGoal: goal._id }));
    assert.equal(String(ok.nextGoal), String(goal._id));
  });
});
