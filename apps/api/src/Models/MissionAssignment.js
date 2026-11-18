// A home mission given to a child (FR-FAM-001). Created by the system, never by a client.
import mongoose from "mongoose";
import { assertChildInFamily } from "../utils/assertChildInFamily.js";
import { expiryFor } from "../missions/familyLoopRules.js";

const missionAssignmentSchema = new mongoose.Schema(
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

    // The mission (a Content record of type "mission") that was chosen
    missionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Content",
      required: true,
      immutable: true,
    },

    // The completed lesson or story that triggered it, when there is one
    sourceProgressId: { type: mongoose.Schema.Types.ObjectId, ref: "Progress", immutable: true },

    // Why selectMission chose it (ADR-0008), kept so a parent or reviewer can see the reason
    reasonRule: { type: String, immutable: true },

    assignedAt: { type: Date, default: Date.now, immutable: true },

    // Set from assignedAt by the rules file. Never sent by a client.
    expiresAt: { type: Date, immutable: true },

    // Set once, when the parent's observation is saved
    completedAt: { type: Date },
  },
  { timestamps: true },
);

missionAssignmentSchema.pre("validate", async function () {
  await assertChildInFamily(this, { requireActive: true });
});

missionAssignmentSchema.pre("validate", function () {
  if (this.isNew && !this.expiresAt) this.expiresAt = expiryFor(this.assignedAt);
});

missionAssignmentSchema.index({ familyId: 1, childId: 1, completedAt: 1, expiresAt: 1 });
// One lesson or story triggers a mission only once for a child
missionAssignmentSchema.index(
  { childId: 1, sourceProgressId: 1 },
  { unique: true, partialFilterExpression: { sourceProgressId: { $exists: true } } },
);

const MissionAssignment = mongoose.model("MissionAssignment", missionAssignmentSchema);
export default MissionAssignment;
