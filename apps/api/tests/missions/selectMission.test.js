// Rule-based mission selection (KAN-34). One test per rule of docs/adr/0008-rule-based-mission-selection.md.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectMission, toMissionInput, RULES_VERSION } from "../../src/missions/selectMission.js";

const mission = (id, extra = {}) => ({
  id,
  ageBand: "9-11",
  domain: "character",
  level: 1,
  estimatedMinutes: 10,
  competencyCodes: ["CHAR-HONESTY"],
  ...extra,
});

const pick = (input) => selectMission({ ageBand: "9-11", ...input });

describe("selectMission", () => {
  describe("answer", () => {
    it("has only the content id, the rule, the competency and the rules version", () => {
      const result = pick({ missions: [mission("m1")] });
      assert.deepEqual(result, {
        contentId: "m1",
        reasonRule: "RULE_NOT_ASSESSED",
        competencyCode: "CHAR-HONESTY",
        rulesVersion: RULES_VERSION,
      });
    });

    it("is RULE_NO_MISSION when nothing fits", () => {
      assert.deepEqual(pick({ missions: [] }), {
        contentId: null,
        reasonRule: "RULE_NO_MISSION",
        competencyCode: null,
        rulesVersion: RULES_VERSION,
      });
    });
  });

  describe("step 1: filter (age band, length, domain, level)", () => {
    it("never gives a mission of another age band, even if nothing else fits", () => {
      const result = pick({
        missions: [mission("young", { ageBand: "6-8" }), mission("old", { ageBand: "12-14" })],
      });
      assert.equal(result.reasonRule, "RULE_NO_MISSION");
    });

    for (const [ageBand, max] of [
      ["6-8", 10],
      ["9-11", 15],
      ["12-14", 20],
    ]) {
      it(`keeps missions of up to ${max} minutes for ${ageBand}`, () => {
        const missions = [
          mission("fits", { ageBand, estimatedMinutes: max }),
          mission("long", { ageBand, estimatedMinutes: max + 1 }),
        ];
        assert.equal(selectMission({ ageBand, missions }).contentId, "fits");
        assert.equal(
          selectMission({ ageBand, missions: [missions[1]] }).reasonRule,
          "RULE_NO_MISSION",
        );
      });
    }

    it("keeps only the requested domain", () => {
      const missions = [
        mission("char"),
        mission("quran", { domain: "quran", competencyCodes: ["QURAN-MADD"] }),
      ];
      assert.equal(pick({ missions, domain: "quran" }).contentId, "quran");
    });

    it("works at the child's level or one above in a domain with a level", () => {
      const missions = [1, 2, 3, 4, 5].map((level) =>
        mission(`q${level}`, { domain: "quran", level }),
      );
      const allowed = (level) =>
        missions
          .filter((m) => pick({ missions: [m], levels: { quran: level } }).contentId)
          .map((m) => m.level);
      assert.deepEqual(allowed(0), [1]);
      assert.deepEqual(allowed(2), [2, 3]);
      assert.deepEqual(allowed(5), [5]);
    });

    it("uses the arabic level for arabic missions", () => {
      const missions = [
        mission("a1", { domain: "arabic", level: 1 }),
        mission("a4", { domain: "arabic", level: 4 }),
      ];
      assert.equal(pick({ missions, levels: { arabic: 3 } }).contentId, "a4");
    });

    it("allows any level where the child has none, lower first", () => {
      const missions = [mission("c3", { level: 3 }), mission("c1", { level: 1 })];
      assert.equal(pick({ missions, levels: { quran: 5 } }).contentId, "c1");
      assert.equal(
        pick({ missions: [mission("q4", { domain: "quran", level: 4 })] }).contentId,
        "q4",
      );
    });
  });

  describe("step 2: rank", () => {
    const missions = [
      mission("achieved", { competencyCodes: ["A"] }),
      mission("practising", { competencyCodes: ["P"] }),
      mission("unknown", { competencyCodes: ["U"] }),
      mission("needs", { competencyCodes: ["N"] }),
      mission("focus", { competencyCodes: ["F"] }),
    ];
    const competencyStatus = { A: "achieved", P: "practising", N: "needs_practice", F: "achieved" };
    const order = (focusCompetency) => {
      const seen = [];
      let left = missions;
      while (left.length) {
        const { contentId, reasonRule, competencyCode } = pick({
          missions: left,
          competencyStatus,
          focusCompetency,
        });
        seen.push([contentId, reasonRule, competencyCode]);
        left = left.filter((m) => m.id !== contentId);
      }
      return seen;
    };

    it("orders focus, needs practice, not assessed, practising, achieved", () => {
      assert.deepEqual(order("F"), [
        ["focus", "RULE_FOCUS", "F"],
        ["needs", "RULE_NEEDS_PRACTICE", "N"],
        ["unknown", "RULE_NOT_ASSESSED", "U"],
        ["practising", "RULE_PRACTISING", "P"],
        ["achieved", "RULE_ALL_ACHIEVED", null],
      ]);
    });

    it("treats a focus competency the child already achieved as focus (FR-AGT-004)", () => {
      assert.equal(order("F")[0][0], "focus");
    });

    it("ranks an achieved mission last when there is no focus", () => {
      assert.deepEqual(order(undefined).at(-1), ["focus", "RULE_ALL_ACHIEVED", null]);
    });

    it("takes the most urgent of a mission's competencies", () => {
      const both = mission("both", { competencyCodes: ["P", "N"] });
      assert.deepEqual(pick({ missions: [both], competencyStatus }).competencyCode, "N");
    });

    it("breaks ties by level, then length, then content id", () => {
      const tied = [
        mission("b", { level: 2 }),
        mission("c", { level: 1, estimatedMinutes: 8 }),
        mission("a", { level: 1, estimatedMinutes: 8 }),
        mission("d", { level: 1, estimatedMinutes: 5 }),
      ];
      assert.equal(pick({ missions: tied }).contentId, "d");
      assert.equal(pick({ missions: tied.filter((m) => m.id !== "d") }).contentId, "a");
    });
  });

  describe("step 3: no repeats", () => {
    const missions = [mission("m1"), mission("m2"), mission("m3")];

    it("skips missions given recently", () => {
      assert.equal(pick({ missions, recentMissionIds: ["m1", "m2"] }).contentId, "m3");
    });

    it("repeats the one given longest ago when all were given recently", () => {
      const result = pick({ missions, recentMissionIds: ["m2", "m1", "m3"] });
      assert.deepEqual([result.contentId, result.reasonRule], ["m3", "RULE_REPEAT"]);
    });
  });

  describe("always the same answer", () => {
    it("does not depend on the order of the missions", () => {
      const missions = [
        mission("x", { level: 2 }),
        mission("y"),
        mission("z", { competencyCodes: ["N"] }),
      ];
      const competencyStatus = { N: "needs_practice" };
      const first = pick({ missions, competencyStatus });
      assert.deepEqual(pick({ missions: [...missions].reverse(), competencyStatus }), first);
      assert.equal(first.contentId, "z");
    });

    it("does not change its inputs", () => {
      const missions = [mission("m2"), mission("m1")];
      const recentMissionIds = ["m1"];
      const before = JSON.stringify({ missions, recentMissionIds });
      pick({ missions, recentMissionIds });
      assert.equal(JSON.stringify({ missions, recentMissionIds }), before);
    });
  });

  describe("bad input", () => {
    it("rejects an unknown age band", () => {
      assert.throws(() => selectMission({ ageBand: "15-17", missions: [] }), /Unknown age band/);
    });

    it("rejects an unknown competency status", () => {
      assert.throws(
        () => pick({ missions: [], competencyStatus: { X: "mastered" } }),
        /Unknown status/,
      );
    });
  });
});

describe("toMissionInput", () => {
  it("keeps only what the rules need and turns competency ids into codes", () => {
    const content = {
      _id: "c1",
      title: "Not needed",
      description: "Not needed",
      type: "mission",
      ageBand: "6-8",
      domain: "character",
      level: 2,
      estimatedMinutes: 10,
      competencies: ["id-1", "id-2", "id-unknown"],
    };
    const codeById = new Map([
      ["id-1", "CHAR-HONESTY"],
      ["id-2", "CHAR-KINDNESS"],
    ]);
    assert.deepEqual(toMissionInput(content, codeById), {
      id: "c1",
      ageBand: "6-8",
      domain: "character",
      level: 2,
      estimatedMinutes: 10,
      competencyCodes: ["CHAR-HONESTY", "CHAR-KINDNESS"],
    });
  });
});
