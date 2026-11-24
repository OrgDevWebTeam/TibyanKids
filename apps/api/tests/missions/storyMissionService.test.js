import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import AuditEvent from "../../src/Models/AuditEvent.js";
import Competency from "../../src/Models/Competency.js";
import Content from "../../src/Models/Content.js";
import StoryMission from "../../src/Models/StoryMission.js";
import {
  getPackage,
  missionForStory,
  publishPackage,
  saveDraftPackage,
} from "../../src/missions/storyMissionService.js";

process.env.JWT_SECRET ??= randomBytes(32).toString("hex");

const newId = () => new mongoose.Types.ObjectId();
let replset;
let honesty;
let counter = 0;

// A published story or mission. Missions need a reviewer who is not the author.
const makeContent = (type, overrides = {}) => {
  counter += 1;
  return Content.create({
    title: `${type} ${counter}`,
    description: `About ${type} ${counter}`,
    type,
    ageBand: "9-11",
    language: "ar",
    domain: "character",
    level: 1,
    estimatedMinutes: 8,
    competencies: [honesty._id],
    createdBy: newId(),
    status: "published",
    ...(type === "mission" ? { reviewedBy: newId(), approvedAt: new Date() } : {}),
    ...overrides,
  });
};

const admin = () => ({ _id: newId(), role: "content_admin" });

const draftData = (mission, overrides = {}) => ({
  missionId: mission._id,
  outcomes: ["The child can explain why telling the truth matters"],
  vocabulary: [{ word: "truthful", meaning: "someone who says what is real" }],
  challenge: {
    prompt: "Your friend broke the cup. What do you do?",
    options: [{ text: "Say it was me" }, { text: "Say nothing" }],
  },
  ...overrides,
});

const rejectsWithStatus = (promise, statusCode) =>
  assert.rejects(promise, (err) => err.statusCode === statusCode);

describe("story mission service (FR-STORY-001, FR-FAM-001, API-006)", () => {
  let story;
  let mission;

  before(async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replset.getUri());
    await Promise.all([StoryMission.init(), AuditEvent.init()]);
  });
  after(async () => {
    await mongoose.disconnect();
    await replset.stop();
  });
  beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) {
      await collection.deleteMany({});
    }
    honesty = await Competency.create({
      domain: "character",
      code: "HONESTY",
      name: { ar: "الصدق", en: "Honesty" },
    });
    story = await makeContent("story");
    mission = await makeContent("mission");
  });

  describe("saving a draft", () => {
    it("creates the package as a draft and writes an audit event", async () => {
      const user = admin();
      const { package: pkg, created } = await saveDraftPackage({
        storyId: story._id,
        user,
        data: draftData(mission),
      });

      assert.equal(created, true);
      assert.equal(pkg.status, "draft");
      assert.equal(String(pkg.createdBy), String(user._id));
      const events = await AuditEvent.find({ action: "content.created" });
      assert.equal(events.length, 1);
      assert.equal(events[0].targetType, "StoryMission");
      assert.equal(String(events[0].targetId), String(pkg._id));
    });

    it("a story that is still a draft can already get its package", async () => {
      const draftStory = await makeContent("story", { status: "draft" });
      const { package: pkg } = await saveDraftPackage({
        storyId: draftStory._id,
        user: admin(),
        data: draftData(mission),
      });
      assert.equal(pkg.status, "draft");
    });

    it("saving again replaces the draft, and clears what was left out", async () => {
      const user = admin();
      await saveDraftPackage({ storyId: story._id, user, data: draftData(mission) });
      const other = await makeContent("mission");

      const { package: pkg, created } = await saveDraftPackage({
        storyId: story._id,
        user,
        data: { missionId: other._id, outcomes: ["A new outcome"], vocabulary: [] },
      });

      assert.equal(created, false);
      assert.equal(await StoryMission.countDocuments(), 1);
      assert.equal(String(pkg.missionId), String(other._id));
      assert.deepEqual([...pkg.outcomes], ["A new outcome"]);
      assert.equal(pkg.vocabulary.length, 0);
      assert.equal(pkg.challenge.prompt, undefined);
      assert.equal(pkg.challenge.options.length, 0);
      assert.equal(await AuditEvent.countDocuments({ action: "content.updated" }), 1);
    });

    it("refuses a story that does not exist, or content that is not a story", async () => {
      await rejectsWithStatus(
        saveDraftPackage({ storyId: newId(), user: admin(), data: draftData(mission) }),
        404,
      );
      const lesson = await makeContent("lesson");
      await rejectsWithStatus(
        saveDraftPackage({ storyId: lesson._id, user: admin(), data: draftData(mission) }),
        404,
      );
      assert.equal(await StoryMission.countDocuments(), 0);
    });

    it("refuses a mission that is not a mission, and saves nothing", async () => {
      const activity = await makeContent("activity");
      await assert.rejects(
        saveDraftPackage({ storyId: story._id, user: admin(), data: draftData(activity) }),
        (err) => err.name === "ValidationError",
      );
      assert.equal(await StoryMission.countDocuments(), 0);
      assert.equal(await AuditEvent.countDocuments(), 0);
    });

    it("a published package cannot be edited", async () => {
      const user = admin();
      await saveDraftPackage({ storyId: story._id, user, data: draftData(mission) });
      await publishPackage({ storyId: story._id, user });

      await rejectsWithStatus(
        saveDraftPackage({ storyId: story._id, user, data: draftData(mission) }),
        409,
      );
    });

    it("two requests at the same moment leave only one package", async () => {
      const results = await Promise.allSettled([
        saveDraftPackage({ storyId: story._id, user: admin(), data: draftData(mission) }),
        saveDraftPackage({ storyId: story._id, user: admin(), data: draftData(mission) }),
      ]);
      assert.ok(results.some((r) => r.status === "fulfilled"));
      assert.equal(await StoryMission.countDocuments(), 1);
    });
  });

  describe("publishing", () => {
    const prepared = async (overrides = {}) => {
      const user = admin();
      await saveDraftPackage({ storyId: story._id, user, data: draftData(mission, overrides) });
      return user;
    };

    it("publishes a complete package, and writes the audit event with it", async () => {
      const user = await prepared();

      const result = await publishPackage({ storyId: story._id, user });

      assert.equal(result.published, true);
      assert.equal(result.package.status, "published");
      assert.ok(result.package.publishedAt instanceof Date);
      assert.equal(String(result.package.publishedBy), String(user._id));
      const events = await AuditEvent.find({ action: "content.published" });
      assert.equal(events.length, 1);
      assert.equal(events[0].targetType, "StoryMission");
    });

    it("says what is wrong and publishes nothing when the package is not ready", async () => {
      const user = await prepared({ outcomes: [] });
      await Content.updateOne({ _id: story._id }, { $set: { status: "in_review" } });
      const otherBand = await makeContent("mission", { ageBand: "12-14" });
      await StoryMission.updateOne({ storyId: story._id }, { $set: { missionId: otherBand._id } });

      const result = await publishPackage({ storyId: story._id, user });

      assert.equal(result.published, false);
      assert.deepEqual(result.problems, [
        "The story must be published",
        "They must be for the same age band",
        "Add at least one learning outcome",
      ]);
      assert.equal((await StoryMission.findOne()).status, "draft");
      assert.equal(await AuditEvent.countDocuments({ action: "content.published" }), 0);
    });

    it("refuses a mission that is not published, or shares no competency", async () => {
      const draftMission = await makeContent("mission", {
        status: "draft",
        reviewedBy: undefined,
        approvedAt: undefined,
      });
      const user = await prepared();
      await StoryMission.updateOne(
        { storyId: story._id },
        { $set: { missionId: draftMission._id } },
      );
      const first = await publishPackage({ storyId: story._id, user });
      assert.deepEqual(first.problems, ["The mission must be published and approved"]);

      const patience = await Competency.create({
        domain: "character",
        code: "PATIENCE",
        name: { ar: "الصبر", en: "Patience" },
      });
      const unrelated = await makeContent("mission", { competencies: [patience._id] });
      await StoryMission.updateOne({ storyId: story._id }, { $set: { missionId: unrelated._id } });
      const second = await publishPackage({ storyId: story._id, user });
      assert.deepEqual(second.problems, ["They must share at least one competency"]);
    });

    it("answers 404 for a story without a package, and 409 for one already published", async () => {
      await rejectsWithStatus(publishPackage({ storyId: story._id, user: admin() }), 404);

      const user = await prepared();
      await publishPackage({ storyId: story._id, user });
      await rejectsWithStatus(publishPackage({ storyId: story._id, user }), 409);
    });

    it("an archived package cannot be published", async () => {
      const user = await prepared();
      await StoryMission.updateOne({ storyId: story._id }, { $set: { status: "archived" } });
      await rejectsWithStatus(publishPackage({ storyId: story._id, user }), 409);
    });

    it("the package and its audit event are saved together, or not at all", async () => {
      const user = await prepared();
      const original = AuditEvent.create;
      AuditEvent.create = async () => {
        throw new Error("the audit log is down");
      };
      try {
        await assert.rejects(publishPackage({ storyId: story._id, user }), /audit log is down/);
      } finally {
        AuditEvent.create = original;
      }
      assert.equal((await StoryMission.findOne()).status, "draft");
    });
  });

  describe("reading a package (the content team)", () => {
    it("gives the package in any status, or a 404", async () => {
      await rejectsWithStatus(getPackage(story._id), 404);
      await saveDraftPackage({ storyId: story._id, user: admin(), data: draftData(mission) });
      const pkg = await getPackage(story._id);
      assert.equal(pkg.status, "draft");
      assert.equal(pkg.outcomes.length, 1);
    });
  });

  describe("the mission of a story for a child (API-006)", () => {
    const child = { ageBand: "9-11" };

    const published = async () => {
      const user = admin();
      await saveDraftPackage({ storyId: story._id, user, data: draftData(mission) });
      await publishPackage({ storyId: story._id, user });
    };

    it("gives the mission and what the package adds, with no author or status", async () => {
      await published();

      const result = await missionForStory({ storyId: story._id, child });

      assert.equal(String(result.story.id), String(story._id));
      assert.equal(String(result.mission.id), String(mission._id));
      assert.equal(result.mission.estimatedMinutes, 8);
      assert.equal(result.outcomes.length, 1);
      assert.equal(result.vocabulary[0].word, "truthful");
      assert.equal(result.challenge.options.length, 2);
      assert.deepEqual(Object.keys(result).sort(), [
        "challenge",
        "mission",
        "outcomes",
        "story",
        "vocabulary",
      ]);
      assert.equal(JSON.stringify(result).includes("createdBy"), false);
    });

    it("gives nothing for a package that is a draft, archived, or does not exist", async () => {
      assert.equal(await missionForStory({ storyId: story._id, child }), null);

      await saveDraftPackage({ storyId: story._id, user: admin(), data: draftData(mission) });
      assert.equal(await missionForStory({ storyId: story._id, child }), null);

      await StoryMission.updateOne({ storyId: story._id }, { $set: { status: "archived" } });
      assert.equal(await missionForStory({ storyId: story._id, child }), null);
    });

    it("gives nothing for a child of another age band", async () => {
      await published();
      assert.equal(await missionForStory({ storyId: story._id, child: { ageBand: "6-8" } }), null);
      assert.equal(
        await missionForStory({ storyId: story._id, child: { ageBand: "12-14" } }),
        null,
      );
    });

    it("gives nothing once the story or the mission is no longer published", async () => {
      await published();
      await Content.updateOne({ _id: mission._id }, { $set: { status: "archived" } });
      assert.equal(await missionForStory({ storyId: story._id, child }), null);

      await Content.updateOne({ _id: mission._id }, { $set: { status: "published" } });
      await Content.updateOne({ _id: story._id }, { $set: { status: "archived" } });
      assert.equal(await missionForStory({ storyId: story._id, child }), null);
    });

    it("a package without a challenge gives no challenge", async () => {
      const user = admin();
      await saveDraftPackage({
        storyId: story._id,
        user,
        data: { missionId: mission._id, outcomes: ["Be honest"], vocabulary: [] },
      });
      await publishPackage({ storyId: story._id, user });

      const result = await missionForStory({ storyId: story._id, child });
      assert.equal(result.challenge, null);
    });
  });
});
