import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  analyticsEventSchema,
  ANALYTICS_EVENT_NAMES,
} from "../../src/validations/analyticsValidation.js";

const base = {
  occurredAt: "2026-11-16T10:00:00.000Z",
  actorType: "parent",
  pseudonymId: "a".repeat(32),
  locale: "ar",
};

// One valid example per event. A test makes sure no event is added without one.
const samples = {
  guardian_verified: {},
  child_created: {},
  baseline_completed: {},
  first_mission_started: { missionType: "story" },
  session_started: {},
  mission_started: { missionType: "family" },
  mission_completed: { missionType: "story", durationSeconds: 300 },
  story_viewed: { storyId: "story-1" },
  story_mission_started: { storyId: "story-1" },
  family_mission_assigned: { missionId: "mission-1" },
  parent_observation_recorded: { status: "independent" },
  growth_evidence_recorded: { domain: "quran", sourceType: "activity" },
  next_goal_completed: { domain: "arabic" },
  quran_attempt_submitted: { surah: 112, ayah: 1, isRepeat: false },
  quran_ai_result_shown: { outcome: "uncertain", confidenceBand: "low" },
  quran_teacher_escalated: {},
  quran_review_completed: { turnaroundHours: 24 },
  weekly_insight_opened: {},
  recommended_action_interacted: { interaction: "accepted" },
  report_history_viewed: {},
  error_occurred: { errorCode: "upload_timeout" },
  upload_failed: { reason: "too_large" },
  content_flagged: { reason: "incorrect" },
  consent_issue: { kind: "missing" },
  support_ticket_created: { category: "account" },
};

const make = (name, extra = {}) => ({
  ...base,
  eventId: randomUUID(),
  name,
  properties: samples[name],
  ...extra,
});
const accepts = (event) => analyticsEventSchema.safeParse(event).success;

// Fields that must never reach analytics (CRS 12.1, SEC-009).
const FORBIDDEN = [
  "childId",
  "familyId",
  "userId",
  "email",
  "childName",
  "parentName",
  "note",
  "audio",
  "transcript",
  "deviceId",
  "advertisingId",
  "ip",
];

describe("analytics event schema (CRS Section 12)", () => {
  it("has a valid sample for every event, and no stale samples", () => {
    assert.deepEqual([...Object.keys(samples)].sort(), [...ANALYTICS_EVENT_NAMES].sort());
    for (const name of ANALYTICS_EVENT_NAMES) {
      assert.ok(accepts(make(name)), `${name} should be accepted`);
    }
  });

  it("accepts an optional age band and rejects an invalid one", () => {
    assert.ok(accepts(make("child_created", { ageBand: "9-11" })));
    assert.ok(!accepts(make("child_created", { ageBand: "5-6" })));
  });

  it("rejects an actor type that is not one of our roles", () => {
    assert.ok(!accepts(make("child_created", { actorType: "guardian" })));
    assert.ok(accepts(make("child_created", { actorType: "parent" })));
  });

  it("rejects an unknown event name", () => {
    assert.ok(!accepts(make("child_created", { name: "child_name_changed" })));
  });

  it("rejects personal data fields at the top level, for every event", () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      for (const key of FORBIDDEN) {
        assert.ok(!accepts(make(name, { [key]: "x" })), `${name} accepted top-level ${key}`);
      }
    }
  });

  it("rejects personal data fields inside properties, for every event", () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      for (const key of FORBIDDEN) {
        const properties = { ...samples[name], [key]: "x" };
        assert.ok(!accepts(make(name, { properties })), `${name} accepted property ${key}`);
      }
    }
  });

  it("rejects free text where a fixed choice is expected", () => {
    const status = make("parent_observation_recorded", {
      properties: { status: "he did not listen to me today" },
    });
    const reason = make("content_flagged", { properties: { reason: "my child was rude" } });
    assert.ok(!accepts(status));
    assert.ok(!accepts(reason));
  });

  it("rejects a pseudonym that is not an opaque id", () => {
    for (const pseudonymId of ["parent@test.com", "507f1f77bcf86cd799439011", "short", ""]) {
      assert.ok(!accepts(make("child_created", { pseudonymId })), `accepted ${pseudonymId}`);
    }
    assert.ok(accepts(make("child_created", { pseudonymId: "f".repeat(64) })));
  });

  it("rejects out-of-range numbers", () => {
    const bad = [
      ["quran_attempt_submitted", { surah: 115, ayah: 1, isRepeat: false }],
      ["quran_attempt_submitted", { surah: 1, ayah: 0, isRepeat: false }],
      ["mission_completed", { missionType: "story", durationSeconds: -1 }],
      ["quran_review_completed", { turnaroundHours: 721 }],
    ];
    for (const [name, properties] of bad) {
      assert.ok(
        !accepts(make(name, { properties })),
        `${name} accepted ${JSON.stringify(properties)}`,
      );
    }
  });

  it("requires the properties object", () => {
    assert.ok(!accepts(make("child_created", { properties: undefined })));
  });
});
