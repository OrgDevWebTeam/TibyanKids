import { z } from "zod";
import {
  FAMILY_LOOP_RULES,
  OBSERVATION_STATUSES,
  REFLECTION_CHOICES,
} from "../missions/familyLoopRules.js";
import { objectId, oneOf, text } from "./helpers.js";

// A parent's observation of a mission (FR-FAM-002). Only these three fields are accepted: a client
// can never choose the child, the family, the result or the weight of the evidence.
export const observeMissionSchema = z
  .object({
    status: oneOf("Status", OBSERVATION_STATUSES),
    note: text("Note")
      .trim()
      .max(
        FAMILY_LOOP_RULES.NOTE_MAX_LENGTH,
        `Note must be at most ${FAMILY_LOOP_RULES.NOTE_MAX_LENGTH} characters`,
      )
      .optional()
      // A note with only spaces is no note
      .transform((note) => note || undefined),
    // Made by the app for each observation, so a repeated request is the same observation
    clientObservationId: text("clientObservationId")
      .trim()
      .min(1, "clientObservationId cannot be empty")
      .max(100, "clientObservationId is too long")
      .optional(),
  })
  .strict();

// The child's reflection (FR-FAM-003): one of the fixed choices, never free text
export const reflectMissionSchema = z
  .object({
    choice: oneOf("Choice", REFLECTION_CHOICES),
  })
  .strict();

// GET /missions: whose missions. The child is required, and nothing else is accepted.
export const missionsQuery = z.object({ childId: objectId("childId") }).strict();
