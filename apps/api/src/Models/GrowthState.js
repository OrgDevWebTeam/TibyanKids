// The current growth state of one child for one competency (CRS section 8, FR-GRW-001, FR-GRW-003).
// Derived from evidence by the system, never edited by a user. Sensitive child learning data.
//
// "Not assessed" and "assessed with a low level" are different states and must stay different
// (FR-GRW-001 acceptance criteria): a competency with no evidence has no level at all.
import mongoose from "mongoose";
import Competency from "./Competency.js";
import { assertChildInFamily } from "../utils/assertChildInFamily.js";
import { applyCompetency } from "../utils/applyCompetency.js";
import { DOMAINS } from "../constants/index.js";

export const GROWTH_STATUSES = ["not_assessed", "assessed"];
export const GROWTH_CONFIDENCE = ["low", "medium", "high"];

const growthStateSchema = new mongoose.Schema(
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

    competencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Competency",
      required: true,
      immutable: true,
    },

    // Filled in from the competency
    domain: { type: String, enum: DOMAINS, required: true, immutable: true },

    status: { type: String, enum: GROWTH_STATUSES, default: "not_assessed" },

    // Same 0 to 5 scale as Assessment.level. Null while the competency is not assessed.
    level: { type: Number, min: 0, max: 5, default: null },

    // How sure the system is about the level. Null while not assessed.
    confidence: { type: String, enum: [...GROWTH_CONFIDENCE, null], default: null },

    evidenceCount: { type: Number, min: 0, default: 0 },

    lastEvidenceAt: { type: Date, default: null },

    // The competency to work on next (FR-GRW-003)
    nextGoal: { type: mongoose.Schema.Types.ObjectId, ref: "Competency", default: null },
  },
  { timestamps: true },
);

growthStateSchema.pre("validate", async function () {
  await assertChildInFamily(this, { requireActive: true });
});

growthStateSchema.pre("validate", async function () {
  await applyCompetency(this);
});

growthStateSchema.pre("validate", function () {
  if (this.status === "not_assessed") {
    if (this.level != null || this.confidence != null || this.evidenceCount > 0) {
      this.invalidate(
        "status",
        "A not-assessed competency cannot have a level, a confidence or evidence",
      );
    }
    return;
  }

  if (this.level == null) this.invalidate("level", "An assessed competency needs a level");
  if (this.confidence == null) {
    this.invalidate("confidence", "An assessed competency needs a confidence");
  }
  if (!(this.evidenceCount >= 1)) {
    this.invalidate("evidenceCount", "An assessed competency needs at least one piece of evidence");
  }
});

growthStateSchema.pre("validate", async function () {
  if (!this.nextGoal || !this.isModified("nextGoal")) return;
  if (!(await Competency.exists({ _id: this.nextGoal, active: true }))) {
    this.invalidate("nextGoal", "The next goal must be an active competency");
  }
});

// One state per child and competency
growthStateSchema.index({ childId: 1, competencyId: 1 }, { unique: true });
growthStateSchema.index({ familyId: 1, childId: 1, domain: 1 });

const GrowthState = mongoose.model("GrowthState", growthStateSchema);
export default GrowthState;
