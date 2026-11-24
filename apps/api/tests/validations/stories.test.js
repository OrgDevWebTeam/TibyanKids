import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STORY_MISSION_LIMITS } from "../../src/Models/StoryMission.js";
import { savePackageSchema, storyMissionQuery } from "../../src/validations/storyValidation.js";

const ID = "507f1f77bcf86cd799439011";
const fieldsOf = (result) => result.error.issues.map((issue) => issue.path.join("."));

const valid = (overrides = {}) => ({
  missionId: ID,
  outcomes: ["The child can explain why telling the truth matters"],
  ...overrides,
});

describe("validation: saving a story mission package (FR-STORY-001)", () => {
  it("accepts a mission and outcomes alone, and fills in the rest as empty", () => {
    const result = savePackageSchema.safeParse(valid());
    assert.equal(result.success, true);
    assert.deepEqual(result.data.vocabulary, []);
    assert.equal(result.data.challenge, undefined);
  });

  it("accepts a draft with nothing but a mission, because publishing checks the rest", () => {
    const result = savePackageSchema.safeParse({ missionId: ID });
    assert.equal(result.success, true);
    assert.deepEqual(result.data.outcomes, []);
  });

  it("accepts a full package", () => {
    const result = savePackageSchema.safeParse(
      valid({
        vocabulary: [{ word: "truthful", meaning: "someone who says what is real" }],
        challenge: {
          prompt: "Your friend broke the cup. What do you do?",
          options: [{ text: "Say it was me" }, { text: "Say nothing" }],
        },
      }),
    );
    assert.equal(result.success, true);
  });

  it("trims every text", () => {
    const { data } = savePackageSchema.safeParse(
      valid({
        outcomes: ["  Be honest  "],
        vocabulary: [{ word: "  truthful ", meaning: " real  " }],
        challenge: { prompt: " Question? ", options: [{ text: " A " }, { text: " B " }] },
      }),
    );
    assert.equal(data.outcomes[0], "Be honest");
    assert.deepEqual(data.vocabulary[0], { word: "truthful", meaning: "real" });
    assert.equal(data.challenge.prompt, "Question?");
    assert.deepEqual(data.challenge.options, [{ text: "A" }, { text: "B" }]);
  });

  describe("the mission", () => {
    it("is required and must be an id", () => {
      for (const body of [{}, { missionId: "not-an-id" }, { missionId: 7 }, { missionId: null }]) {
        const result = savePackageSchema.safeParse(body);
        assert.equal(result.success, false);
        assert.ok(fieldsOf(result).includes("missionId"));
      }
    });

    it("cannot be an operator object", () => {
      const result = savePackageSchema.safeParse(valid({ missionId: { $ne: "" } }));
      assert.equal(result.success, false);
      assert.deepEqual(fieldsOf(result), ["missionId"]);
    });
  });

  describe("outcomes", () => {
    it("refuses blank, non-text and over-long outcomes", () => {
      for (const outcomes of [[""], ["   "], [42], [null], [{ $gt: "" }]]) {
        const result = savePackageSchema.safeParse(valid({ outcomes }));
        assert.equal(result.success, false, JSON.stringify(outcomes));
        assert.equal(fieldsOf(result)[0], "outcomes.0");
      }
      const tooLong = "x".repeat(STORY_MISSION_LIMITS.outcomeLength + 1);
      assert.equal(savePackageSchema.safeParse(valid({ outcomes: [tooLong] })).success, false);
      const exactly = "x".repeat(STORY_MISSION_LIMITS.outcomeLength);
      assert.equal(savePackageSchema.safeParse(valid({ outcomes: [exactly] })).success, true);
    });

    it("refuses a list that is too long, or not a list", () => {
      const many = Array.from({ length: STORY_MISSION_LIMITS.outcomes + 1 }, (_, i) => `O${i}`);
      assert.equal(savePackageSchema.safeParse(valid({ outcomes: many })).success, false);
      assert.equal(savePackageSchema.safeParse(valid({ outcomes: "Be honest" })).success, false);
    });
  });

  describe("vocabulary", () => {
    it("needs a word and a meaning in every entry, and nothing else", () => {
      const bad = [
        [{ word: "truthful" }],
        [{ meaning: "real" }],
        [{ word: "", meaning: "real" }],
        [{ word: "truthful", meaning: "real", audio: "x.mp3" }],
      ];
      for (const vocabulary of bad) {
        assert.equal(savePackageSchema.safeParse(valid({ vocabulary })).success, false);
      }
    });

    it("refuses the same word twice, whatever its case", () => {
      const result = savePackageSchema.safeParse(
        valid({
          vocabulary: [
            { word: "Truthful", meaning: "one" },
            { word: "truthful", meaning: "two" },
          ],
        }),
      );
      assert.equal(result.success, false);
      assert.deepEqual(fieldsOf(result), ["vocabulary"]);
    });

    it("refuses too much vocabulary", () => {
      const words = Array.from({ length: STORY_MISSION_LIMITS.vocabulary + 1 }, (_, i) => ({
        word: `w${i}`,
        meaning: "m",
      }));
      assert.equal(savePackageSchema.safeParse(valid({ vocabulary: words })).success, false);
    });
  });

  describe("challenge", () => {
    const options = (n) => Array.from({ length: n }, (_, i) => ({ text: `Choice ${i}` }));

    it("is a question with two to four choices", () => {
      for (const n of [2, 3, 4]) {
        const challenge = { prompt: "Question?", options: options(n) };
        assert.equal(savePackageSchema.safeParse(valid({ challenge })).success, true);
      }
      for (const n of [0, 1, 5]) {
        const challenge = { prompt: "Question?", options: options(n) };
        const result = savePackageSchema.safeParse(valid({ challenge }));
        assert.equal(result.success, false);
        assert.deepEqual(fieldsOf(result), ["challenge.options"]);
      }
    });

    it("needs both a prompt and options", () => {
      assert.equal(
        savePackageSchema.safeParse(valid({ challenge: { options: options(2) } })).success,
        false,
      );
      assert.equal(
        savePackageSchema.safeParse(valid({ challenge: { prompt: "Question?" } })).success,
        false,
      );
      assert.equal(savePackageSchema.safeParse(valid({ challenge: {} })).success, false);
    });

    it("refuses a correct answer or any other extra field, which a child's app must never see", () => {
      const withAnswer = { prompt: "Question?", options: options(2), correct: 0 };
      assert.equal(savePackageSchema.safeParse(valid({ challenge: withAnswer })).success, false);
      const optionWithFlag = {
        prompt: "Question?",
        options: [{ text: "A", correct: true }, { text: "B" }],
      };
      assert.equal(
        savePackageSchema.safeParse(valid({ challenge: optionWithFlag })).success,
        false,
      );
    });
  });

  it("refuses fields a client must never choose", () => {
    for (const extra of [
      { storyId: ID },
      { status: "published" },
      { createdBy: ID },
      { publishedAt: "2026-11-24" },
      { publishedBy: ID },
    ]) {
      const result = savePackageSchema.safeParse(valid(extra));
      assert.equal(result.success, false, `accepted ${Object.keys(extra)[0]}`);
    }
  });
});

describe("validation: asking for a story's mission (API-006)", () => {
  it("accepts no query, or a child id", () => {
    assert.equal(storyMissionQuery.safeParse({}).success, true);
    assert.equal(storyMissionQuery.safeParse({ childId: ID }).success, true);
  });

  it("refuses a bad child id, an operator, and any other parameter", () => {
    for (const query of [
      { childId: "nope" },
      { childId: { $ne: "x" } },
      { childId: ID, familyId: ID },
      { status: "published" },
    ]) {
      assert.equal(storyMissionQuery.safeParse(query).success, false, JSON.stringify(query));
    }
  });
});
