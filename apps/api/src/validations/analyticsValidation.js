import { z } from "zod";
import { AGE_BANDS, DOMAINS, LANGUAGES } from "../constants/index.js";

// PRIVACY (CRS 12.1): no free text, no child/family/user ids, no audio, no advertising ids.
// Every object is strict, so a field that is not listed here is rejected.

const identifier = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/);
const missionType = z.enum(["story", "family"]);
const domain = z.enum(DOMAINS);

const baseShape = {
  eventId: z.uuid(),
  occurredAt: z.iso.datetime(),
  // Matches our roles. "staff" covers content_admin, reviewer, platform_admin, analytics_support.
  actorType: z.enum(["parent", "child", "teacher", "staff", "visitor", "system"]),
  // Opaque pseudonym, never a database id. 32 to 64 lowercase hex characters.
  pseudonymId: z.string().regex(/^[a-f0-9]{32,64}$/),
  locale: z.enum(LANGUAGES),
  ageBand: z.enum(AGE_BANDS).optional(),
};

// Event name -> allowed properties. Grouped by the CRS Section 12 areas.
const DEFINITIONS = {
  // Activation
  guardian_verified: {},
  child_created: {},
  baseline_completed: {},
  first_mission_started: { missionType },

  // Child engagement
  session_started: {},
  mission_started: { missionType },
  mission_completed: { missionType, durationSeconds: z.number().int().min(0).max(7200) },

  // Story conversion
  story_viewed: { storyId: identifier },
  story_mission_started: { storyId: identifier },

  // Family Loop
  family_mission_assigned: { missionId: identifier },
  parent_observation_recorded: {
    status: z.enum(["independent", "reminder", "not_observed"]),
  },

  // Growth
  growth_evidence_recorded: {
    domain,
    sourceType: z.enum(["assessment", "activity", "observation"]),
  },
  next_goal_completed: { domain },

  // Quran
  quran_attempt_submitted: {
    surah: z.number().int().min(1).max(114),
    ayah: z.number().int().min(1).max(286),
    isRepeat: z.boolean(),
  },
  quran_ai_result_shown: {
    outcome: z.enum(["clear", "uncertain"]),
    confidenceBand: z.enum(["low", "medium", "high"]),
  },
  quran_teacher_escalated: {},
  quran_review_completed: { turnaroundHours: z.number().int().min(0).max(720) },

  // Parent value
  weekly_insight_opened: {},
  recommended_action_interacted: { interaction: z.enum(["viewed", "accepted", "dismissed"]) },
  report_history_viewed: {},

  // Quality
  error_occurred: { errorCode: identifier },
  upload_failed: {
    reason: z.enum(["too_large", "unsupported_format", "network", "quality_rejected", "other"]),
  },
  content_flagged: { reason: z.enum(["incorrect", "inappropriate", "other"]) },
  consent_issue: { kind: z.enum(["missing", "withdrawn"]) },
  support_ticket_created: {
    category: z.enum(["account", "child_data", "content", "technical", "other"]),
  },
};

const event = (name, properties) =>
  z
    .object({
      ...baseShape,
      name: z.literal(name),
      properties: z.object(properties).strict(),
    })
    .strict();

export const ANALYTICS_EVENT_NAMES = Object.keys(DEFINITIONS);

export const analyticsEventSchema = z.discriminatedUnion(
  "name",
  Object.entries(DEFINITIONS).map(([name, properties]) => event(name, properties)),
);
