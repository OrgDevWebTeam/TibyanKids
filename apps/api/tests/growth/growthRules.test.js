import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GROWTH_RULES,
  chooseNextGoal,
  deriveCompetencyState,
  resultForActivityScore,
  resultForAssessmentLevel,
  summarizeDomain,
} from "../../src/growth/growthRules.js";

let minute = 0;
const event = (result, weight = 0.5) => ({
  result,
  weight,
  occurredAt: new Date(Date.UTC(2026, 10, 1, 10, minute++)),
});
const many = (n, result, weight) => Array.from({ length: n }, () => event(result, weight));

describe("growth rules: one competency", () => {
  it("no evidence means not assessed, with no level (not a low level)", () => {
    const state = deriveCompetencyState([]);
    assert.deepEqual(state, {
      status: "not_assessed",
      level: null,
      confidence: null,
      evidenceCount: 0,
      lastEvidenceAt: null,
    });
  });

  it("assessed with the worst result is level 0, which is not the same as not assessed", () => {
    const state = deriveCompetencyState([event("not_met")]);
    assert.equal(state.status, "assessed");
    assert.equal(state.level, 0);
  });

  it("one piece of evidence can never reach the top levels (VAL-005)", () => {
    const state = deriveCompetencyState([event("met", 0.8)]);
    assert.equal(state.level, 2);
    assert.equal(state.confidence, "low");
  });

  it("more evidence allows a higher level", () => {
    const levels = [1, 2, 3, 5].map((n) => deriveCompetencyState(many(n, "met")).level);
    assert.deepEqual(levels, [2, 3, 4, 5]);
  });

  it("weights and results are averaged, so mixed evidence lands in the middle", () => {
    const state = deriveCompetencyState([...many(3, "met"), ...many(3, "not_met")]);
    assert.equal(state.level, 3); // an average of 0.5 on a scale of 5, rounded
  });

  it("a heavier source counts more than a lighter one", () => {
    const heavy = deriveCompetencyState([
      event("met", 0.8),
      event("not_met", 0.3),
      event("met", 0.5),
    ]);
    const light = deriveCompetencyState([
      event("met", 0.3),
      event("not_met", 0.8),
      event("met", 0.5),
    ]);
    assert.ok(heavy.level > light.level);
  });

  it("only the newest evidence decides the level, so a child's growth shows", () => {
    const old = many(GROWTH_RULES.RECENT_EVIDENCE_LIMIT, "not_met");
    const recent = many(GROWTH_RULES.RECENT_EVIDENCE_LIMIT, "met").map((e, i) => ({
      ...e,
      occurredAt: new Date(Date.UTC(2026, 11, 1, 10, i)),
    }));
    const state = deriveCompetencyState([...old, ...recent]);
    assert.equal(state.level, 5);
    assert.equal(state.evidenceCount, old.length + recent.length);
  });

  it("confidence grows with the amount of evidence and its weight", () => {
    assert.equal(deriveCompetencyState(many(2, "met", 0.8)).confidence, "low");
    assert.equal(deriveCompetencyState(many(3, "met", 0.5)).confidence, "medium");
    assert.equal(deriveCompetencyState(many(5, "met", 0.8)).confidence, "high");
    // Many pieces of very light evidence are still not high confidence
    assert.equal(deriveCompetencyState(many(5, "met", 0.1)).confidence, "low");
  });

  it("reports the time of the newest evidence", () => {
    const events = many(3, "met");
    assert.deepEqual(deriveCompetencyState(events).lastEvidenceAt, events[2].occurredAt);
  });
});

describe("growth rules: results from scores and levels", () => {
  it("turns an activity score into a result, and no score into partly met", () => {
    assert.equal(resultForActivityScore(100), "met");
    assert.equal(resultForActivityScore(70), "met");
    assert.equal(resultForActivityScore(69), "partly_met");
    assert.equal(resultForActivityScore(40), "partly_met");
    assert.equal(resultForActivityScore(39), "not_met");
    assert.equal(resultForActivityScore(null), "partly_met");
  });

  it("turns an assessment level into a result", () => {
    assert.deepEqual([5, 4, 3, 2, 1, 0].map(resultForAssessmentLevel), [
      "met",
      "met",
      "partly_met",
      "partly_met",
      "not_met",
      "not_met",
    ]);
  });
});

describe("growth rules: next goal and domain summary", () => {
  const a = { _id: "a", code: "Q-1" };
  const b = { _id: "b", code: "Q-2" };
  const c = { _id: "c", code: "Q-3" };
  const state = (level) => ({ status: "assessed", level });

  it("prefers a competency that was never assessed, lowest code first", () => {
    const states = new Map([["a", state(5)]]);
    assert.equal(chooseNextGoal([c, b, a], states), "b");
  });

  it("otherwise takes the assessed one with the lowest level below 5", () => {
    const states = new Map([
      ["a", state(4)],
      ["b", state(2)],
      ["c", state(5)],
    ]);
    assert.equal(chooseNextGoal([a, b, c], states), "b");
  });

  it("has no next goal when everything is at the top level", () => {
    const states = new Map([
      ["a", state(5)],
      ["b", state(5)],
    ]);
    assert.equal(chooseNextGoal([a, b], states), null);
  });

  it("a domain with nothing assessed is not assessed, even if it has competencies", () => {
    const summary = summarizeDomain([a, b, c], []);
    assert.equal(summary.status, "not_assessed");
    assert.equal(summary.level, null);
    assert.equal(summary.totalCompetencies, 3);
    assert.equal(summary.assessedCompetencies, 0);
  });

  it("a domain level is the average of its assessed competencies, weighted by evidence", () => {
    const states = [
      { status: "assessed", level: 4, confidence: "high", evidenceCount: 3 },
      { status: "assessed", level: 2, confidence: "medium", evidenceCount: 1 },
    ];
    const summary = summarizeDomain([a, b], states);
    assert.equal(summary.level, 4); // (4*3 + 2*1) / 4 = 3.5, rounded
    assert.equal(summary.confidence, "medium"); // the weakest competency
    assert.equal(summary.evidenceCount, 4);
  });

  it("a domain with less than half of its competencies assessed is never above low", () => {
    const states = [{ status: "assessed", level: 5, confidence: "high", evidenceCount: 6 }];
    assert.equal(summarizeDomain([a, b, c], states).confidence, "low");
  });
});
