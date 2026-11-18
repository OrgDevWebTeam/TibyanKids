import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FAMILY_LOOP_RULES,
  OBSERVATION_RESULT,
  OBSERVATION_STATUSES,
  REFLECTION_CHOICES,
  assignmentStatus,
  competencyStatusFromGrowth,
  expiryFor,
} from "../../src/missions/familyLoopRules.js";
import { GROWTH_RULES } from "../../src/growth/growthRules.js";
import { STATUSES } from "../../src/missions/selectMission.js";

describe("family loop rules: observations", () => {
  it("independent is met and a reminder is partly met", () => {
    assert.equal(OBSERVATION_RESULT.independent, "met");
    assert.equal(OBSERVATION_RESULT.reminder, "partly_met");
  });

  it("not observed has no result, so it can never become evidence", () => {
    assert.equal("not_observed" in OBSERVATION_RESULT, false);
    assert.ok(OBSERVATION_STATUSES.includes("not_observed"));
  });

  it("every result is one the growth rules can score", () => {
    for (const result of Object.values(OBSERVATION_RESULT)) {
      assert.ok(result in GROWTH_RULES.RESULT_SCORE, `${result} has no score`);
    }
  });

  it("offers fixed reflection choices", () => {
    assert.deepEqual(REFLECTION_CHOICES, [
      "enjoyed_it",
      "proud",
      "want_more",
      "was_hard",
      "not_sure",
    ]);
  });
});

describe("family loop rules: assignment status", () => {
  const assignedAt = new Date("2026-11-01T10:00:00Z");
  const expiresAt = expiryFor(assignedAt);

  it("expires after the lifetime in the rules", () => {
    assert.equal(expiresAt.toISOString(), "2026-11-08T10:00:00.000Z");
  });

  it("is pending before the expiry date", () => {
    const now = new Date("2026-11-05T10:00:00Z");
    assert.equal(assignmentStatus({ expiresAt }, now), "pending");
  });

  it("is expired after the expiry date", () => {
    const now = new Date("2026-11-09T10:00:00Z");
    assert.equal(assignmentStatus({ expiresAt }, now), "expired");
  });

  it("is completed once observed, even after the expiry date", () => {
    const now = new Date("2026-12-01T10:00:00Z");
    const completedAt = new Date("2026-11-03T10:00:00Z");
    assert.equal(assignmentStatus({ completedAt, expiresAt }, now), "completed");
  });
});

describe("family loop rules: growth state to mission selection status", () => {
  const assessed = (level) => ({ status: "assessed", level });

  it("no state, or not assessed, is not assessed", () => {
    assert.equal(competencyStatusFromGrowth(undefined), "not_assessed");
    assert.equal(competencyStatusFromGrowth(null), "not_assessed");
    assert.equal(
      competencyStatusFromGrowth({ status: "not_assessed", level: null }),
      "not_assessed",
    );
  });

  it("levels 4 and 5 are achieved", () => {
    assert.equal(competencyStatusFromGrowth(assessed(4)), "achieved");
    assert.equal(competencyStatusFromGrowth(assessed(5)), "achieved");
  });

  it("level 3 is practising", () => {
    assert.equal(competencyStatusFromGrowth(assessed(3)), "practising");
  });

  it("level 2 and below need practice, including level 0", () => {
    assert.equal(competencyStatusFromGrowth(assessed(2)), "needs_practice");
    assert.equal(competencyStatusFromGrowth(assessed(0)), "needs_practice");
  });

  it("only returns statuses that the mission selection understands", () => {
    for (const level of [0, 1, 2, 3, 4, 5]) {
      assert.ok(STATUSES.includes(competencyStatusFromGrowth(assessed(level))));
    }
  });
});

describe("family loop rules: the rules cannot be changed", () => {
  it("is frozen", () => {
    assert.throws(() => {
      FAMILY_LOOP_RULES.ASSIGNMENT_LIFETIME_DAYS = 1;
    }, TypeError);
    assert.equal(FAMILY_LOOP_RULES.ASSIGNMENT_LIFETIME_DAYS, 7);
  });
});
