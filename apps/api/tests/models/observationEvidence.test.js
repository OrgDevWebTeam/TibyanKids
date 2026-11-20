import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Child from "../../src/Models/Child.js";
import Competency from "../../src/Models/Competency.js";
import Content from "../../src/Models/Content.js";
import EvidenceEvent from "../../src/Models/EvidenceEvent.js";
import Family from "../../src/Models/Family.js";
import GrowthState from "../../src/Models/GrowthState.js";
import MissionAssignment from "../../src/Models/MissionAssignment.js";
import ParentObservation from "../../src/Models/ParentObservation.js";
import { recordObservationEvidence } from "../../src/growth/growthService.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "../helpers/db.js";

const newId = () => new mongoose.Types.ObjectId();
let codeCounter = 0;

const makeChild = async () => {
  const family = await Family.create({ name: "Test family", parentId: newId() });
  return Child.create({
    name: "Ahmad",
    dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 8, 0, 1)),
    familyId: family._id,
    status: "active",
  });
};

const makeCompetency = (overrides = {}) => {
  codeCounter += 1;
  return Competency.create({
    domain: "quran",
    code: `O-${codeCounter}`,
    name: { ar: "كفاءة", en: "Competency" },
    ...overrides,
  });
};

const makeMission = (competencies) =>
  Content.create({
    title: "Home mission",
    type: "mission",
    ageBand: "6-8",
    language: "ar",
    domain: "quran",
    level: 1,
    estimatedMinutes: 10,
    competencies: competencies.map((c) => c._id),
    createdBy: newId(),
  });

// A child, a mission for these competencies, its assignment, and an observation of it
const observe = async (competencies, status = "independent") => {
  const child = await makeChild();
  const mission = await makeMission(competencies);
  const assignment = await MissionAssignment.create({
    familyId: child.familyId,
    childId: child._id,
    missionId: mission._id,
  });
  const observation = await ParentObservation.create({
    familyId: child.familyId,
    childId: child._id,
    assignmentId: assignment._id,
    observedBy: newId(),
    status,
  });
  return { child, observation };
};

describe("evidence from parent observations (FR-FAM-002, FR-GRW-001)", () => {
  before(async () => {
    await connectTestDb();
    await Promise.all([EvidenceEvent.init(), GrowthState.init(), MissionAssignment.init()]);
  });
  after(disconnectTestDb);
  beforeEach(clearTestDb);

  it("an independent observation is weak evidence that the competency is met", async () => {
    const competency = await makeCompetency();
    const { child, observation } = await observe([competency], "independent");

    const recorded = await recordObservationEvidence(observation);

    assert.equal(recorded.length, 1);
    const event = await EvidenceEvent.findOne({ childId: child._id });
    assert.equal(event.sourceType, "observation");
    assert.equal(String(event.sourceId), String(observation._id));
    assert.equal(event.result, "met");
    assert.equal(event.weight, 0.3);
    const state = await GrowthState.findOne({ childId: child._id });
    assert.equal(state.status, "assessed");
    assert.ok(state.level <= 2, "one observation can never reach a high level");
  });

  it("a reminder is partly met", async () => {
    const competency = await makeCompetency();
    const { child, observation } = await observe([competency], "reminder");
    await recordObservationEvidence(observation);
    assert.equal((await EvidenceEvent.findOne({ childId: child._id })).result, "partly_met");
  });

  it("not observed is no evidence and creates no growth state", async () => {
    const competency = await makeCompetency();
    const { observation } = await observe([competency], "not_observed");

    assert.deepEqual(await recordObservationEvidence(observation), []);
    assert.equal(await EvidenceEvent.countDocuments(), 0);
    assert.equal(await GrowthState.countDocuments(), 0);
  });

  it("a mission without competencies gives no evidence", async () => {
    const { observation } = await observe([]);
    assert.deepEqual(await recordObservationEvidence(observation), []);
    assert.equal(await EvidenceEvent.countDocuments(), 0);
  });

  it("gives evidence for each active competency of the mission, and skips inactive ones", async () => {
    const [one, two] = [await makeCompetency(), await makeCompetency()];
    const inactive = await makeCompetency({ active: false });
    const { observation } = await observe([one, inactive, two]);

    const recorded = await recordObservationEvidence(observation);

    assert.equal(recorded.length, 2);
    assert.equal(await EvidenceEvent.countDocuments(), 2);
  });

  it("counts the same observation only once", async () => {
    const competency = await makeCompetency();
    const { observation } = await observe([competency]);

    await recordObservationEvidence(observation);
    const again = await recordObservationEvidence(observation);

    assert.deepEqual(again, []);
    assert.equal(await EvidenceEvent.countDocuments(), 1);
  });
});
