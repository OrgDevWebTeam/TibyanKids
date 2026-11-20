// How the child felt about a mission (FR-FAM-003). Fixed choices. Never evidence.
import mongoose from "mongoose";
import { assertChildInFamily } from "../utils/assertChildInFamily.js";
import { REFLECTION_CHOICES } from "../missions/familyLoopRules.js";

const childReflectionSchema = new mongoose.Schema(
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

    choice: { type: String, enum: REFLECTION_CHOICES, required: true, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

childReflectionSchema.pre("validate", async function () {
  await assertChildInFamily(this, { requireActive: true });
});

// One reflection per mission
childReflectionSchema.index({ assignmentId: 1 }, { unique: true });

const ChildReflection = mongoose.model("ChildReflection", childReflectionSchema);
export default ChildReflection;
