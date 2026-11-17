// One recited ayah of a child, with the AI result for it. Owner: Qussai.
// Highly sensitive (a child's voice was analysed), but the audio itself is never stored here: it is
// only sent to the AI service and dropped (audio retention is not decided yet).
// A quality rejection is not an attempt (VAL-014), so it is never saved.
import mongoose from "mongoose";
import {
  AI_CATEGORIES,
  AI_DECISIONS,
  AI_ERROR_CODES,
  AI_QUALITIES,
  RECITATION_LEVELS,
} from "@noor/contracts";
import { assertChildInFamily } from "../utils/assertChildInFamily.js";

// Why the API saved a fallback result instead of the AI's (see src/ai/aiClient.js)
export const AI_FAILURES = ["timeout", "unreachable", "ai_error", "bad_request", "invalid_result"];

// One finding of the AI result (docs/contracts/ai-result.md)
const findingSchema = new mongoose.Schema(
  {
    wordIndex: { type: Number, required: true, min: 1 },
    category: { type: String, enum: AI_CATEGORIES, required: true },
    code: { type: String, enum: AI_ERROR_CODES, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    wordStartMs: { type: Number, required: true, min: 0 },
    wordEndMs: { type: Number, required: true, min: 0 },
    messageKey: { type: String, required: true },
  },
  { _id: false },
);

// The AI result as received (already checked with aiResultSchema), or the fallback result
const resultSchema = new mongoose.Schema(
  {
    model: { type: String, required: true },
    modelVersion: { type: String, required: true },
    decision: { type: String, enum: AI_DECISIONS, required: true },
    quality: { type: String, enum: AI_QUALITIES, required: true },
    findings: [findingSchema],
    processingMs: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const quranAttemptSchema = new mongoose.Schema(
  {
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
      immutable: true,
    },

    childId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Child",
      required: true,
      immutable: true,
    },

    // Made by the app for each recording. The same id again is the same attempt (VAL-010)
    clientAttemptId: { type: String, required: true, immutable: true, trim: true, maxlength: 64 },

    surah: { type: Number, required: true, immutable: true },
    ayah: { type: Number, required: true, immutable: true },
    level: { type: String, enum: RECITATION_LEVELS, required: true, immutable: true },

    result: { type: resultSchema, required: true },

    // Set only when the AI service failed and the fallback result was saved
    aiFailure: { type: String, enum: AI_FAILURES, default: null },
  },
  { timestamps: true },
);

// Kept on purpose, like every child-linked model: no code path can save an attempt for another family
quranAttemptSchema.pre("validate", async function () {
  await assertChildInFamily(this, { requireActive: true });
});

// One attempt per recording, even if the app sends it twice (VAL-010)
quranAttemptSchema.index({ childId: 1, clientAttemptId: 1 }, { unique: true });
quranAttemptSchema.index({ familyId: 1, childId: 1, createdAt: -1 });

const QuranAttempt = mongoose.model("QuranAttempt", quranAttemptSchema);
export default QuranAttempt;
