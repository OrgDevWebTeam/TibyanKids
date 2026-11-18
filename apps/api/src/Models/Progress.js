import mongoose from "mongoose";
import { assertChildInFamily } from "../utils/assertChildInFamily.js";
import { recordProgressEvidence } from "../growth/growthService.js";
import { assignMissionForProgress } from "../missions/missionService.js";

const progressSchema = new mongoose.Schema(
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

    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Content",
      required: true,
      immutable: true,
    },

    status: {
      type: String,
      enum: ["not_started", "in_progress", "completed"],
      default: "not_started",
    },

    score: { type: Number, min: 0, max: 100, default: null },

    lastStep: { type: Number, min: 0, default: 0 },

    startedAt: { type: Date, default: null },

    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

progressSchema.pre("validate", function () {
  if (this.status !== "not_started" && !this.startedAt) {
    this.startedAt = new Date();
  }
  if (this.status === "completed" && !this.completedAt) {
    this.completedAt = new Date();
  }
  if (this.status !== "completed" && this.completedAt) {
    this.invalidate("status", "Completed progress cannot be reopened");
  }
});

progressSchema.pre("validate", async function () {
  await assertChildInFamily(this, { requireActive: true });
});

// A completed activity is evidence for the Growth Map (FR-GRW-002). Saving the progress must never
// fail because of the Growth Map, so a failure is logged (ids only) and the progress stays saved.
progressSchema.pre("save", function () {
  this.$locals.becameCompleted =
    this.status === "completed" && (this.isNew || this.isModified("status"));
});

progressSchema.post("save", async function (doc) {
  if (!doc.$locals.becameCompleted) return;
  doc.$locals.becameCompleted = false;
  try {
    await recordProgressEvidence(doc, { session: doc.$session() });
  } catch (error) {
    console.error(`Growth evidence failed for progress ${doc._id}: ${error.message}`);
  }
  // Then a home mission, chosen with the growth state this completion just changed (FR-FAM-001).
  // It has its own try/catch: a failed mission must not hide the evidence or fail the save.
  try {
    await assignMissionForProgress(doc, { session: doc.$session() });
  } catch (error) {
    console.error(`Mission assignment failed for progress ${doc._id}: ${error.message}`);
  }
});

progressSchema.index({ childId: 1, contentId: 1 }, { unique: true });
progressSchema.index({ familyId: 1, childId: 1, status: 1 });

const Progress = mongoose.model("Progress", progressSchema);
export default Progress;
