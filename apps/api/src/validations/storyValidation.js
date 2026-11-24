import { z } from "zod";
import { STORY_MISSION_LIMITS as LIMITS } from "../Models/StoryMission.js";
import { objectId, text } from "./helpers.js";

// A Content Admin builds a story mission package (FR-STORY-001). Only these fields are accepted: the
// story comes from the URL, and a client can never set the status, the author or the dates.

const outcome = text("Outcome")
  .trim()
  .min(1, "An outcome cannot be empty")
  .max(LIMITS.outcomeLength, `An outcome must be at most ${LIMITS.outcomeLength} characters`);

const vocabularyEntry = z
  .object({
    word: text("Word")
      .trim()
      .min(1, "A word cannot be empty")
      .max(LIMITS.wordLength, `A word must be at most ${LIMITS.wordLength} characters`),
    meaning: text("Meaning")
      .trim()
      .min(1, "A meaning cannot be empty")
      .max(LIMITS.meaningLength, `A meaning must be at most ${LIMITS.meaningLength} characters`),
  })
  .strict();

const challengeOption = z
  .object({
    text: text("Option")
      .trim()
      .min(1, "An option cannot be empty")
      .max(LIMITS.optionLength, `An option must be at most ${LIMITS.optionLength} characters`),
  })
  .strict();

// A decision challenge: a question with two to four choices
const challenge = z
  .object({
    prompt: text("Prompt")
      .trim()
      .min(1, "The prompt cannot be empty")
      .max(LIMITS.promptLength, `The prompt must be at most ${LIMITS.promptLength} characters`),
    options: z
      .array(challengeOption, { error: "Options must be a list" })
      .min(2, "A challenge needs at least two options")
      .max(LIMITS.options, `A challenge can have at most ${LIMITS.options} options`),
  })
  .strict();

// Creates the package as a draft, or replaces the content of the existing draft.
// Anything left out is emptied: the body is the whole package. Whether it may be published is
// decided later, when the admin publishes it (missions/contentLinking.js).
export const savePackageSchema = z
  .object({
    missionId: objectId("Mission id"),
    outcomes: z
      .array(outcome, { error: "Outcomes must be a list" })
      .max(LIMITS.outcomes, `At most ${LIMITS.outcomes} outcomes`)
      .default([]),
    vocabulary: z
      .array(vocabularyEntry, { error: "Vocabulary must be a list" })
      .max(LIMITS.vocabulary, `At most ${LIMITS.vocabulary} vocabulary words`)
      .refine(
        (entries) => new Set(entries.map((e) => e.word.toLowerCase())).size === entries.length,
        {
          message: "Each word can appear only once",
        },
      )
      .default([]),
    challenge: challenge.optional(),
  })
  .strict();

// GET /stories/:id/mission. A parent says which child the mission is for (the child decides the
// age band). Staff do not need it. The controller asks for it when the caller is a parent.
export const storyMissionQuery = z.object({ childId: objectId("childId").optional() }).strict();

// Completing a story takes no body. A client cannot send a score, a status or a date: anything in
// the body is refused. (No body at all is fine.)
export const completeStorySchema = z.object({}).strict().optional();
