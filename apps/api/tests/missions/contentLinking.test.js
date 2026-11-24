import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LINK_RULES,
  eligibleForChild,
  packageProblems,
  sharedCompetencies,
} from "../../src/missions/contentLinking.js";

// An id that behaves like a MongoDB ObjectId: it compares as text
const objectId = (hex) => ({ toString: () => hex });

const story = (overrides = {}) => ({
  type: "story",
  status: "published",
  ageBand: "9-11",
  language: "ar",
  competencies: ["c-honesty"],
  ...overrides,
});

const mission = (overrides = {}) => ({
  type: "mission",
  status: "published",
  ageBand: "9-11",
  language: "ar",
  competencies: ["c-honesty", "c-kindness"],
  ...overrides,
});

const outcomes = ["The child can say why telling the truth matters"];

describe("content linking: what blocks a package (FR-STORY-001)", () => {
  it("a published story and mission that match give no problems", () => {
    assert.deepEqual(packageProblems({ story: story(), mission: mission(), outcomes }), []);
  });

  it("refuses a story or a mission that does not exist", () => {
    const problems = packageProblems({ story: null, mission: null, outcomes });
    assert.deepEqual(problems, ["The story was not found", "The mission was not found"]);
  });

  it("refuses content of the wrong type", () => {
    const problems = packageProblems({
      story: story({ type: "lesson" }),
      mission: mission({ type: "activity" }),
      outcomes,
    });
    assert.ok(problems.includes("The story must be content of type story"));
    assert.ok(problems.includes("The mission must be content of type mission"));
  });

  it("refuses a story or a mission that is not published", () => {
    for (const status of ["draft", "in_review", "archived"]) {
      assert.deepEqual(
        packageProblems({ story: story({ status }), mission: mission(), outcomes }),
        ["The story must be published"],
      );
      assert.deepEqual(
        packageProblems({ story: story(), mission: mission({ status }), outcomes }),
        ["The mission must be published and approved"],
      );
    }
  });

  it("refuses a different age band", () => {
    const problems = packageProblems({
      story: story(),
      mission: mission({ ageBand: "6-8" }),
      outcomes,
    });
    assert.deepEqual(problems, ["They must be for the same age band"]);
  });

  it("refuses a different language", () => {
    const problems = packageProblems({
      story: story(),
      mission: mission({ language: "en" }),
      outcomes,
    });
    assert.deepEqual(problems, ["They must be in the same language"]);
  });

  it("refuses a pair that shares no competency", () => {
    const problems = packageProblems({
      story: story({ competencies: ["c-honesty"] }),
      mission: mission({ competencies: ["c-patience"] }),
      outcomes,
    });
    assert.deepEqual(problems, ["They must share at least one competency"]);
  });

  it("refuses content with no competencies at all", () => {
    const problems = packageProblems({
      story: story({ competencies: undefined }),
      mission: mission({ competencies: [] }),
      outcomes,
    });
    assert.deepEqual(problems, ["They must share at least one competency"]);
  });

  it("needs at least one real learning outcome", () => {
    for (const bad of [undefined, [], ["", "   "], [42, null]]) {
      assert.deepEqual(packageProblems({ story: story(), mission: mission(), outcomes: bad }), [
        "Add at least one learning outcome",
      ]);
    }
  });

  it("reports every problem at once, so the admin fixes them in one go", () => {
    const problems = packageProblems({
      story: story({ status: "draft" }),
      mission: mission({ ageBand: "12-14", language: "en", competencies: ["c-patience"] }),
      outcomes: [],
    });
    assert.deepEqual(problems, [
      "The story must be published",
      "They must be for the same age band",
      "They must be in the same language",
      "They must share at least one competency",
      "Add at least one learning outcome",
    ]);
  });
});

describe("content linking: shared competencies", () => {
  it("finds the competencies both train", () => {
    assert.deepEqual(
      sharedCompetencies(
        story({ competencies: ["a", "b", "c"] }),
        mission({ competencies: ["c", "a", "z"] }),
      ),
      ["a", "c"],
    );
  });

  it("compares ids as text, so ObjectIds and strings match", () => {
    const shared = sharedCompetencies(
      story({ competencies: [objectId("507f1f77bcf86cd799439011")] }),
      mission({ competencies: ["507f1f77bcf86cd799439011"] }),
    );
    assert.equal(shared.length, 1);
  });

  it("gives an empty list when something is missing", () => {
    assert.deepEqual(sharedCompetencies(null, mission()), []);
    assert.deepEqual(sharedCompetencies(story(), null), []);
  });
});

describe("content linking: is it suitable for this child (API-006)", () => {
  const child = { ageBand: "9-11" };

  it("only published content of the child's age band is suitable", () => {
    assert.equal(eligibleForChild(mission(), child), true);
  });

  it("an unpublished item is not", () => {
    for (const status of ["draft", "in_review", "archived"]) {
      assert.equal(eligibleForChild(mission({ status }), child), false);
    }
  });

  it("another age band is not", () => {
    assert.equal(eligibleForChild(mission({ ageBand: "12-14" }), child), false);
    assert.equal(eligibleForChild(mission({ ageBand: "6-8" }), child), false);
  });

  it("the language does not matter", () => {
    assert.equal(eligibleForChild(mission({ language: "en" }), child), true);
  });

  it("nothing is suitable without a content item or a child", () => {
    assert.equal(eligibleForChild(null, child), false);
    assert.equal(eligibleForChild(mission(), null), false);
    assert.equal(eligibleForChild(mission(), {}), false);
  });
});

describe("content linking: the rules cannot be changed", () => {
  it("is frozen", () => {
    assert.throws(() => {
      LINK_RULES.MIN_OUTCOMES = 0;
    }, TypeError);
    assert.equal(LINK_RULES.MIN_OUTCOMES, 1);
  });
});
