import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Assessment from "../../src/Models/Assessment.js";
import Child from "../../src/Models/Child.js";
import Competency from "../../src/Models/Competency.js";
import Content from "../../src/Models/Content.js";
import EvidenceEvent from "../../src/Models/EvidenceEvent.js";
import Family from "../../src/Models/Family.js";
import GrowthState from "../../src/Models/GrowthState.js";
import Progress from "../../src/Models/Progress.js";
import { recordEvidence } from "../../src/growth/growthService.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "../helpers/db.js";

const newId = () => new mongoose.Types.ObjectId();
let codeCounter = 0;

const makeChild = async (status = "active") => {
  const family = await Family.create({ name: "Test family", parentId: newId() });
  return Child.create({
    name: "Ahmad",
    dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 8, 0, 1)),
    familyId: family._id,
    status,
  });
};

const makeCompetency = (overrides = {}) => {
  codeCounter += 1;
  return Competency.create({
    domain: "quran",
    code: `S-${codeCounter}`,
    name: { ar: "كفاءة", en: "Competency" },
    ...overrides,
  });
};

const makeContent = (competencies) =>
  Content.create({
    title: "Lesson",
    type: "lesson",
    ageBand: "6-8",
    language: "ar",
    domain: "quran",
    level: 1,
    estimatedMinutes: 10,
    competencies: competencies.map((c) => c._id),
    createdBy: newId(),
  });

const evidenceInput = (child, competency, overrides = {}) => ({
  familyId: child.familyId,
  childId: child._id,
  competencyId: competency._id,
  sourceType: "activity",
  weight: 0.5,
  result: "met",
  ...overrides,
});

const stateOf = (child, competency) =>
  GrowthState.findOne({ childId: child._id, competencyId: competency._id });

describe("growth service (FR-GRW-001, FR-GRW-002)", () => {
  before(async () => {
    await connectTestDb();
    await EvidenceEvent.init(); // the unique indexes must exist before the tests
    await GrowthState.init();
  });
  after(disconnectTestDb);
  beforeEach(clearTestDb);

  it("saves evidence and creates the growth state it belongs to", async () => {
    const child = await makeChild();
    const competency = await makeCompetency({ domain: "faith" });
    const result = await recordEvidence(evidenceInput(child, competency, { weight: 0.8 }));

    assert.equal(result.state.status, "assessed");
    assert.equal(result.state.domain, "faith");
    assert.equal(result.state.evidenceCount, 1);
    assert.equal(result.state.level, 2); // one piece of evidence cannot reach the top levels
    assert.equal(result.state.confidence, "low");
    assert.equal(await EvidenceEvent.countDocuments(), 1);
  });

  it("updates the same state when more evidence arrives", async () => {
    const child = await makeChild();
    const competency = await makeCompetency();
    for (let i = 0; i < 3; i += 1) await recordEvidence(evidenceInput(child, competency));

    assert.equal(await GrowthState.countDocuments(), 1);
    const state = await stateOf(child, competency);
    assert.equal(state.evidenceCount, 3);
    assert.equal(state.level, 4);
    assert.equal(state.confidence, "medium");
  });

  it("counts the same source only once for a competency", async () => {
    const child = await makeChild();
    const competency = await makeCompetency();
    const input = evidenceInput(child, competency, { sourceId: newId() });

    assert.ok(await recordEvidence(input));
    assert.equal(await recordEvidence(input), null);
    assert.equal(await EvidenceEvent.countDocuments(), 1);
  });

  it("refuses evidence for a child without active consent", async () => {
    const child = await makeChild("pending_consent");
    const competency = await makeCompetency();
    await assert.rejects(
      recordEvidence(evidenceInput(child, competency)),
      (err) => err.name === "ValidationError",
    );
    assert.equal(await GrowthState.countDocuments(), 0);
  });

  it("points the next goal at a competency that was never assessed", async () => {
    const child = await makeChild();
    const first = await makeCompetency({ code: "Z-1" });
    const second = await makeCompetency({ code: "Z-2" });

    await recordEvidence(evidenceInput(child, first));
    assert.equal(String((await stateOf(child, first)).nextGoal), String(second._id));

    // Once both are assessed, the lower level is next, and the older state follows
    await recordEvidence(evidenceInput(child, second, { result: "not_met" }));
    assert.equal(String((await stateOf(child, first)).nextGoal), String(second._id));
    assert.equal(String((await stateOf(child, second)).nextGoal), String(second._id));
  });

  describe("automatic evidence", () => {
    it("a completed activity is evidence for each active competency of its content, once", async () => {
      const child = await makeChild();
      const [one, two] = [await makeCompetency(), await makeCompetency()];
      const inactive = await makeCompetency({ active: false });
      const content = await makeContent([one, inactive, two]);

      const progress = await Progress.create({
        familyId: child.familyId,
        childId: child._id,
        contentId: content._id,
        status: "completed",
        score: 90,
      });

      const evidence = await EvidenceEvent.find({ sourceId: progress._id });
      assert.equal(evidence.length, 2);
      assert.ok(evidence.every((e) => e.sourceType === "activity" && e.result === "met"));
      assert.equal((await stateOf(child, one)).status, "assessed");
      assert.equal(await stateOf(child, inactive), null);

      // Saving the same progress again changes nothing
      progress.score = 95;
      await progress.save();
      assert.equal(await EvidenceEvent.countDocuments({ sourceId: progress._id }), 2);
    });

    it("an activity that is not completed yet is not evidence", async () => {
      const child = await makeChild();
      const competency = await makeCompetency();
      const content = await makeContent([competency]);

      const progress = await Progress.create({
        familyId: child.familyId,
        childId: child._id,
        contentId: content._id,
        status: "in_progress",
      });
      assert.equal(await EvidenceEvent.countDocuments(), 0);

      progress.status = "completed";
      progress.score = 40;
      await progress.save();
      const [evidence] = await EvidenceEvent.find({ sourceId: progress._id });
      assert.equal(evidence.result, "partly_met");
    });

    it("an activity without a score proves only that the child took part", async () => {
      const child = await makeChild();
      const competency = await makeCompetency();
      const content = await makeContent([competency]);

      await Progress.create({
        familyId: child.familyId,
        childId: child._id,
        contentId: content._id,
        status: "completed",
      });
      const [evidence] = await EvidenceEvent.find();
      assert.equal(evidence.result, "partly_met");
    });

    it("a completed assessment is evidence for each active competency of its domain", async () => {
      const child = await makeChild();
      const [one, two] = [
        await makeCompetency({ domain: "arabic" }),
        await makeCompetency({ domain: "arabic" }),
      ];
      await makeCompetency({ domain: "arabic", active: false });
      await makeCompetency({ domain: "faith" });

      const assessment = await Assessment.create({
        familyId: child.familyId,
        childId: child._id,
        domain: "arabic",
        status: "completed",
        level: 4,
        score: 80,
      });

      const evidence = await EvidenceEvent.find({ sourceId: assessment._id });
      assert.equal(evidence.length, 2);
      assert.ok(evidence.every((e) => e.sourceType === "assessment" && e.result === "met"));
      assert.equal((await stateOf(child, one)).status, "assessed");
      assert.equal((await stateOf(child, two)).status, "assessed");
      assert.equal(await GrowthState.countDocuments({ domain: "faith" }), 0);
    });

    it("never stops the progress from saving when the Growth Map fails", async (t) => {
      const child = await makeChild();
      const competency = await makeCompetency();
      const content = await makeContent([competency]);

      t.mock.method(EvidenceEvent, "create", async () => {
        throw new Error("boom");
      });
      const logged = t.mock.method(console, "error", () => {});

      const progress = await Progress.create({
        familyId: child.familyId,
        childId: child._id,
        contentId: content._id,
        status: "completed",
        score: 90,
      });

      assert.ok(await Progress.findById(progress._id));
      assert.equal(logged.mock.callCount(), 1);
      assert.ok(String(logged.mock.calls[0].arguments[0]).includes(String(progress._id)));
    });
  });
});
