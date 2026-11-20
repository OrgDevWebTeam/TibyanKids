import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Child from "../../src/Models/Child.js";
import Competency from "../../src/Models/Competency.js";
import Content from "../../src/Models/Content.js";
import Family from "../../src/Models/Family.js";
import GrowthState from "../../src/Models/GrowthState.js";
import MissionAssignment from "../../src/Models/MissionAssignment.js";
import Progress from "../../src/Models/Progress.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "../helpers/db.js";

const newId = () => new mongoose.Types.ObjectId();
let counter = 0;

const makeChild = async (status = "active") => {
  const family = await Family.create({ name: "Test family", parentId: newId() });
  return Child.create({
    name: "Ahmad",
    dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 8, 0, 1)), // the 6-8 age band
    familyId: family._id,
    status,
  });
};

const makeCompetency = () => {
  counter += 1;
  return Competency.create({
    domain: "quran",
    code: `AA-${counter}`,
    name: { ar: "كفاءة", en: "Competency" },
  });
};

const makeContent = (type, competencies, overrides = {}) => {
  counter += 1;
  return Content.create({
    title: `${type} ${counter}`,
    type,
    ageBand: "6-8",
    language: "ar",
    domain: "quran",
    level: 1,
    estimatedMinutes: 5,
    competencies: competencies.map((c) => c._id),
    createdBy: newId(),
    ...(type === "mission"
      ? { reviewedBy: newId(), approvedAt: new Date(), status: "published" }
      : {}),
    ...overrides,
  });
};

const complete = (child, content, overrides = {}) =>
  Progress.create({
    familyId: child.familyId,
    childId: child._id,
    contentId: content._id,
    status: "completed",
    score: 90,
    ...overrides,
  });

describe("a completed lesson leads to a home mission (FR-FAM-001)", () => {
  let competency;

  before(async () => {
    await connectTestDb();
    await MissionAssignment.init();
  });
  after(disconnectTestDb);
  beforeEach(async () => {
    await clearTestDb();
    competency = await makeCompetency();
  });

  it("a completed lesson gives the child a mission, linked to that progress", async () => {
    const child = await makeChild();
    const mission = await makeContent("mission", [competency]);
    const lesson = await makeContent("lesson", [competency]);

    const progress = await complete(child, lesson);

    const assignments = await MissionAssignment.find();
    assert.equal(assignments.length, 1);
    assert.equal(String(assignments[0].missionId), String(mission._id));
    assert.equal(String(assignments[0].sourceProgressId), String(progress._id));
    assert.equal(String(assignments[0].childId), String(child._id));
  });

  it("a story also leads to a mission", async () => {
    const child = await makeChild();
    await makeContent("mission", [competency]);
    await complete(child, await makeContent("story", [competency]));
    assert.equal(await MissionAssignment.countDocuments(), 1);
  });

  it("other kinds of content do not", async () => {
    const child = await makeChild();
    await makeContent("mission", [competency]);
    await complete(child, await makeContent("activity", [competency]));
    assert.equal(await MissionAssignment.countDocuments(), 0);
  });

  it("a lesson that is not finished does not", async () => {
    const child = await makeChild();
    await makeContent("mission", [competency]);
    const lesson = await makeContent("lesson", [competency]);
    await complete(child, lesson, { status: "in_progress", score: null });
    assert.equal(await MissionAssignment.countDocuments(), 0);
  });

  it("saving the same completed progress again does not give a second mission", async () => {
    const child = await makeChild();
    await makeContent("mission", [competency]);
    await makeContent("mission", [competency]);
    const progress = await complete(child, await makeContent("lesson", [competency]));

    progress.score = 95;
    await progress.save();

    assert.equal(await MissionAssignment.countDocuments(), 1);
  });

  it("the mission is chosen after the evidence, so it can use the new growth state", async () => {
    const child = await makeChild();
    await makeContent("mission", [competency]);
    await complete(child, await makeContent("lesson", [competency]));

    assert.equal(await GrowthState.countDocuments({ childId: child._id }), 1);
    const [assignment] = await MissionAssignment.find();
    assert.ok(assignment.reasonRule);
  });

  it("no published mission means no mission, and the progress is still saved", async () => {
    const child = await makeChild();
    const progress = await complete(child, await makeContent("lesson", [competency]));

    assert.equal(await MissionAssignment.countDocuments(), 0);
    assert.ok(await Progress.findById(progress._id));
  });

  it("a mission that fails to assign never fails the progress", async () => {
    const child = await makeChild();
    await makeContent("mission", [competency]);
    const lesson = await makeContent("lesson", [competency]);
    const original = MissionAssignment.create;
    const errors = [];
    const log = console.error;
    console.error = (message) => errors.push(message);
    MissionAssignment.create = async () => {
      throw new Error("database is down");
    };
    try {
      const progress = await complete(child, lesson);
      assert.ok(await Progress.findById(progress._id));
    } finally {
      MissionAssignment.create = original;
      console.error = log;
    }
    assert.equal(await MissionAssignment.countDocuments(), 0);
    assert.ok(errors.some((e) => e.includes("Mission assignment failed")));
  });
});
