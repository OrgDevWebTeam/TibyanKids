import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Content from "../../src/Models/Content.js";
import StoryMission, { STORY_MISSION_LIMITS } from "../../src/Models/StoryMission.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "../helpers/db.js";

const newId = () => new mongoose.Types.ObjectId();

const makeContent = (type, overrides = {}) =>
  Content.create({
    title: `A ${type}`,
    type,
    ageBand: "9-11",
    language: "ar",
    domain: "character",
    level: 1,
    estimatedMinutes: 10,
    createdBy: newId(),
    ...overrides,
  });

// The fields of a valid package. A test changes only what it is about.
const packageFor = (story, mission, overrides = {}) => ({
  storyId: story._id,
  missionId: mission._id,
  outcomes: ["The child can explain why telling the truth matters"],
  createdBy: newId(),
  ...overrides,
});

const rejectsWith = (promise, path) =>
  assert.rejects(
    promise,
    (err) => err.name === "ValidationError" && Boolean(err.errors[path]),
    `expected a validation error on ${path}`,
  );

describe("story mission packages (FR-STORY-001)", () => {
  let story;
  let mission;

  before(async () => {
    await connectTestDb();
    await StoryMission.init(); // the unique index must exist before the tests
  });
  after(disconnectTestDb);
  beforeEach(async () => {
    await clearTestDb();
    story = await makeContent("story");
    mission = await makeContent("mission");
  });

  it("saves a package as a draft, with its outcomes, vocabulary and challenge", async () => {
    const created = await StoryMission.create(
      packageFor(story, mission, {
        vocabulary: [{ word: "truthful", meaning: "someone who says what is real" }],
        challenge: {
          prompt: "Your friend broke the cup. What do you do?",
          options: [{ text: "Say it was me" }, { text: "Say nothing" }],
        },
      }),
    );

    assert.equal(created.status, "draft");
    assert.equal(created.outcomes.length, 1);
    assert.equal(created.vocabulary[0].word, "truthful");
    assert.equal(created.challenge.options.length, 2);
    assert.equal(created.publishedAt, undefined);
  });

  it("a package may have no vocabulary and no challenge yet", async () => {
    const created = await StoryMission.create(packageFor(story, mission));
    assert.equal(created.vocabulary.length, 0);
    assert.equal(created.challenge.options.length, 0);
  });

  it("trims the text of the outcomes", async () => {
    const created = await StoryMission.create(
      packageFor(story, mission, { outcomes: ["  Be honest  "] }),
    );
    assert.equal(created.outcomes[0], "Be honest");
  });

  describe("the story and the mission", () => {
    it("refuses a story that is not content of type story", async () => {
      const lesson = await makeContent("lesson");
      await rejectsWith(StoryMission.create(packageFor(lesson, mission)), "storyId");
    });

    it("refuses a mission that is not content of type mission", async () => {
      const activity = await makeContent("activity");
      await rejectsWith(StoryMission.create(packageFor(story, activity)), "missionId");
    });

    it("refuses a story or a mission that does not exist", async () => {
      await rejectsWith(StoryMission.create(packageFor({ _id: newId() }, mission)), "storyId");
      await rejectsWith(StoryMission.create(packageFor(story, { _id: newId() })), "missionId");
    });

    it("needs both a story and a mission", async () => {
      const data = packageFor(story, mission);
      delete data.storyId;
      await rejectsWith(StoryMission.create(data), "storyId");

      const noMission = packageFor(story, mission);
      delete noMission.missionId;
      await rejectsWith(StoryMission.create(noMission), "missionId");
    });

    it("one story has only one package", async () => {
      await StoryMission.create(packageFor(story, mission));
      const another = await makeContent("mission");
      await assert.rejects(
        StoryMission.create(packageFor(story, another)),
        (err) => err.code === 11000,
      );
    });

    it("one mission can serve several stories", async () => {
      const secondStory = await makeContent("story");
      await StoryMission.create(packageFor(story, mission));
      await StoryMission.create(packageFor(secondStory, mission));
      assert.equal(await StoryMission.countDocuments({ missionId: mission._id }), 2);
    });

    it("the story cannot be changed afterwards, but the mission can", async () => {
      const created = await StoryMission.create(packageFor(story, mission));
      const otherStory = await makeContent("story");
      const otherMission = await makeContent("mission");

      created.storyId = otherStory._id;
      created.missionId = otherMission._id;
      await created.save();

      const saved = await StoryMission.findById(created._id);
      assert.equal(String(saved.storyId), String(story._id));
      assert.equal(String(saved.missionId), String(otherMission._id));
    });

    it("a changed mission must still be a mission", async () => {
      const created = await StoryMission.create(packageFor(story, mission));
      const lesson = await makeContent("lesson");
      created.missionId = lesson._id;
      await rejectsWith(created.save(), "missionId");
    });
  });

  describe("outcomes, vocabulary and challenge", () => {
    it("refuses too many outcomes, or an outcome that is too long", async () => {
      const many = Array.from(
        { length: STORY_MISSION_LIMITS.outcomes + 1 },
        (_, i) => `Outcome ${i}`,
      );
      await rejectsWith(
        StoryMission.create(packageFor(story, mission, { outcomes: many })),
        "outcomes",
      );

      const long = "x".repeat(STORY_MISSION_LIMITS.outcomeLength + 1);
      await rejectsWith(
        StoryMission.create(packageFor(story, mission, { outcomes: [long] })),
        "outcomes.0",
      );
    });

    it("a vocabulary entry needs a word and a meaning", async () => {
      await rejectsWith(
        StoryMission.create(packageFor(story, mission, { vocabulary: [{ word: "truthful" }] })),
        "vocabulary.0.meaning",
      );
      await rejectsWith(
        StoryMission.create(packageFor(story, mission, { vocabulary: [{ meaning: "real" }] })),
        "vocabulary.0.word",
      );
    });

    it("refuses too much vocabulary", async () => {
      const words = Array.from({ length: STORY_MISSION_LIMITS.vocabulary + 1 }, (_, i) => ({
        word: `w${i}`,
        meaning: "m",
      }));
      await rejectsWith(
        StoryMission.create(packageFor(story, mission, { vocabulary: words })),
        "vocabulary",
      );
    });

    it("a challenge is a question with two to four choices", async () => {
      const challenge = (prompt, count) => ({
        prompt,
        options: Array.from({ length: count }, (_, i) => ({ text: `Choice ${i}` })),
      });

      await rejectsWith(
        StoryMission.create(packageFor(story, mission, { challenge: challenge("Question?", 1) })),
        "challenge.options",
      );
      await rejectsWith(
        StoryMission.create(packageFor(story, mission, { challenge: challenge("Question?", 5) })),
        "challenge.options",
      );
      await rejectsWith(
        StoryMission.create(packageFor(story, mission, { challenge: challenge(undefined, 2) })),
        "challenge.prompt",
      );
      await StoryMission.create(
        packageFor(story, mission, { challenge: challenge("Question?", 4) }),
      );
    });
  });

  describe("status", () => {
    it("refuses a status that does not exist", async () => {
      await rejectsWith(
        StoryMission.create(packageFor(story, mission, { status: "live" })),
        "status",
      );
    });

    it("a published package gets its publication date", async () => {
      const created = await StoryMission.create(
        packageFor(story, mission, { status: "published" }),
      );
      assert.ok(created.publishedAt instanceof Date);
    });

    it("a published package cannot have empty outcomes", async () => {
      for (const outcomes of [[], ["   "]]) {
        await rejectsWith(
          StoryMission.create(packageFor(story, mission, { status: "published", outcomes })),
          "outcomes",
        );
      }
    });

    it("needs to know who created it", async () => {
      const data = packageFor(story, mission);
      delete data.createdBy;
      await rejectsWith(StoryMission.create(data), "createdBy");
    });
  });
});
