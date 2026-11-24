import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Child from "../../src/Models/Child.js";
import Competency from "../../src/Models/Competency.js";
import Content from "../../src/Models/Content.js";
import Family from "../../src/Models/Family.js";
import MissionAssignment from "../../src/Models/MissionAssignment.js";
import Progress from "../../src/Models/Progress.js";
import StoryMission from "../../src/Models/StoryMission.js";
import { STORY_LINK_REASON } from "../../src/missions/missionService.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "../helpers/db.js";

const newId = () => new mongoose.Types.ObjectId();
let counter = 0;

const makeChild = async () => {
  const family = await Family.create({ name: "Test family", parentId: newId() });
  return Child.create({
    name: "Ahmad",
    dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 8, 0, 1)), // the 6-8 age band
    familyId: family._id,
    status: "active",
  });
};

const makeContent = (type, competency, overrides = {}) => {
  counter += 1;
  return Content.create({
    title: `${type} ${counter}`,
    type,
    ageBand: "6-8",
    language: "ar",
    domain: "character",
    level: 1,
    estimatedMinutes: 5,
    competencies: [competency._id],
    createdBy: newId(),
    status: "published",
    ...(type === "mission" ? { reviewedBy: newId(), approvedAt: new Date() } : {}),
    ...overrides,
  });
};

const link = (story, mission, overrides = {}) =>
  StoryMission.create({
    storyId: story._id,
    missionId: mission._id,
    outcomes: ["The child can explain why telling the truth matters"],
    createdBy: newId(),
    status: "published",
    ...overrides,
  });

const complete = (child, content) =>
  Progress.create({
    familyId: child.familyId,
    childId: child._id,
    contentId: content._id,
    status: "completed",
    score: 90,
  });

describe("a completed story gives the mission its package links (FR-FAM-001, FR-STORY-001)", () => {
  let competency;
  let child;
  let story;
  // Two missions. Without a link, the rules choose "plain": it has the lower level, so it ranks first.
  let linked;
  let plain;

  before(async () => {
    await connectTestDb();
    await Promise.all([MissionAssignment.init(), StoryMission.init()]);
  });
  after(disconnectTestDb);
  beforeEach(async () => {
    await clearTestDb();
    competency = await Competency.create({
      domain: "character",
      code: "HONESTY",
      name: { ar: "الصدق", en: "Honesty" },
    });
    child = await makeChild();
    story = await makeContent("story", competency);
    linked = await makeContent("mission", competency, { level: 3, estimatedMinutes: 9 });
    plain = await makeContent("mission", competency, { level: 1, estimatedMinutes: 5 });
  });

  const assignments = () => MissionAssignment.find({ childId: child._id });

  it("without a package, the rules choose the mission (so the tests below prove something)", async () => {
    await complete(child, story);

    const [assignment] = await assignments();
    assert.equal(String(assignment.missionId), String(plain._id));
    assert.notEqual(assignment.reasonRule, STORY_LINK_REASON);
  });

  it("with a published package, the story's own mission is given, and says why", async () => {
    await link(story, linked);

    const progress = await complete(child, story);

    const all = await assignments();
    assert.equal(all.length, 1);
    assert.equal(String(all[0].missionId), String(linked._id));
    assert.equal(all[0].reasonRule, STORY_LINK_REASON);
    assert.equal(String(all[0].sourceProgressId), String(progress._id));
  });

  it("a package that is still a draft does not count", async () => {
    await link(story, linked, { status: "draft" });
    await complete(child, story);

    const [assignment] = await assignments();
    assert.equal(String(assignment.missionId), String(plain._id));
  });

  it("falls back to the rules when the linked mission no longer suits the child", async () => {
    await link(story, linked);
    await Content.updateOne({ _id: linked._id }, { $set: { status: "archived" } });
    await complete(child, story);
    assert.equal(String((await assignments())[0].missionId), String(plain._id));

    await MissionAssignment.deleteMany({});
    await Progress.deleteMany({});
    await Content.updateOne(
      { _id: linked._id },
      { $set: { status: "published", ageBand: "9-11" } },
    );
    await complete(child, story);
    assert.equal(String((await assignments())[0].missionId), String(plain._id));
  });

  it("a lesson never uses a package, only a story does", async () => {
    await link(story, linked);
    const lesson = await makeContent("lesson", competency);

    await complete(child, lesson);

    const [assignment] = await assignments();
    assert.equal(String(assignment.missionId), String(plain._id));
    assert.notEqual(assignment.reasonRule, STORY_LINK_REASON);
  });

  it("a child who already has the most missions open gets no more", async () => {
    await link(story, linked);
    for (let i = 0; i < 3; i += 1) {
      const other = await makeContent("mission", competency);
      await MissionAssignment.create({
        familyId: child.familyId,
        childId: child._id,
        missionId: other._id,
      });
    }

    await complete(child, story);

    assert.equal(await MissionAssignment.countDocuments({ childId: child._id }), 3);
    assert.equal(await MissionAssignment.countDocuments({ missionId: linked._id }), 0);
  });

  it("the same mission is not given twice while it is still open", async () => {
    await link(story, linked);
    await MissionAssignment.create({
      familyId: child.familyId,
      childId: child._id,
      missionId: linked._id,
    });

    await complete(child, story);

    assert.equal(await MissionAssignment.countDocuments({ missionId: linked._id }), 1);
  });

  it("saving the same completed story again does not give a second mission", async () => {
    await link(story, linked);
    const progress = await complete(child, story);

    progress.score = 95;
    await progress.save();

    assert.equal(await MissionAssignment.countDocuments({ childId: child._id }), 1);
  });

  it("a failure while linking never fails the child's progress", async () => {
    await link(story, linked);
    const original = StoryMission.findOne;
    const logged = [];
    const originalLog = console.error;
    console.error = (message) => logged.push(String(message));
    StoryMission.findOne = () => {
      throw new Error("the database is down");
    };
    let progress;
    try {
      progress = await complete(child, story);
    } finally {
      StoryMission.findOne = original;
      console.error = originalLog;
    }

    assert.ok(await Progress.findById(progress._id));
    assert.equal(await MissionAssignment.countDocuments(), 0);
    assert.ok(logged.some((line) => line.includes("Mission assignment failed")));
  });
});
