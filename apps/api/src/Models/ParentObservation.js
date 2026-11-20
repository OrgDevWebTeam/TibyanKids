// What a parent saw their child do at home (FR-FAM-002). A fact: it is never edited.
import mongoose from "mongoose";
import { assertChildInFamily } from "../utils/assertChildInFamily.js";
import { FAMILY_LOOP_RULES, OBSERVATION_STATUSES } from "../missions/familyLoopRules.js";

const parentObservationSchema = new mongoose.Schema(
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

    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MissionAssignment",
      required: true,
      immutable: true,
    },

    // The parent who saved it
    observedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    status: { type: String, enum: OBSERVATION_STATUSES, required: true, immutable: true },

    note: {
      type: String,
      trim: true,
      maxlength: FAMILY_LOOP_RULES.NOTE_MAX_LENGTH,
      immutable: true,
    },

    // Chosen by the app, so that a retry of the same request saves only one observation
    clientObservationId: { type: String, trim: true, maxlength: 100, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

parentObservationSchema.pre("validate", async function () {
  await assertChildInFamily(this, { requireActive: true });
});

// A mission is observed once
parentObservationSchema.index({ assignmentId: 1 }, { unique: true });
// A retry with the same client id is recognised
parentObservationSchema.index(
  { familyId: 1, clientObservationId: 1 },
  { unique: true, partialFilterExpression: { clientObservationId: { $exists: true } } },
);

const ParentObservation = mongoose.model("ParentObservation", parentObservationSchema);
export default ParentObservation;
