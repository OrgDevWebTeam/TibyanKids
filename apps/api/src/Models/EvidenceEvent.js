// One piece of evidence that supports a growth inference (CRS section 8, FR-GRW-001, FR-GRW-002).
// Sensitive child learning data. An evidence event is a fact: it is never edited. It can only be
// removed by the deletion workflow (SEC-015, VAL-008).
import mongoose from "mongoose";
import { assertChildInFamily } from "../utils/assertChildInFamily.js";
import { applyCompetency } from "../utils/applyCompetency.js";
import { DOMAINS } from "../constants/index.js";

export const EVIDENCE_SOURCES = ["assessment", "activity", "observation"];
export const EVIDENCE_RESULTS = ["met", "partly_met", "not_met"];

const evidenceEventSchema = new mongoose.Schema(
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

    // Filled in from the competency, never sent by a client
    domain: { type: String, enum: DOMAINS, required: true, immutable: true },

    // Where the evidence came from (FR-GRW-001: assessment, activity or observation)
    sourceType: { type: String, enum: EVIDENCE_SOURCES, required: true, immutable: true },

    // The record behind it (an Assessment, a Progress record or an observation), when there is one
    sourceId: { type: mongoose.Schema.Types.ObjectId, immutable: true },

    // How much this evidence counts, from 0 to 1. One observation is never definitive (VAL-005).
    weight: { type: Number, required: true, min: 0, max: 1, immutable: true },

    result: { type: String, enum: EVIDENCE_RESULTS, required: true, immutable: true },

    occurredAt: { type: Date, default: Date.now, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

evidenceEventSchema.pre("validate", async function () {
  await assertChildInFamily(this, { requireActive: true });
});

evidenceEventSchema.pre("validate", async function () {
  await applyCompetency(this);
});

// Append-only: an update fails loudly instead of being ignored.
evidenceEventSchema.pre(
  ["updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace", "replaceOne"],
  function () {
    throw new Error("Evidence events are append-only and cannot be updated");
  },
);

evidenceEventSchema.pre("save", function () {
  if (!this.isNew) throw new Error("Evidence events are append-only and cannot be updated");
});

evidenceEventSchema.index({ familyId: 1, childId: 1, domain: 1, occurredAt: -1 });
evidenceEventSchema.index({ childId: 1, competencyId: 1, occurredAt: -1 });
// The same source (a completed activity or assessment) counts once for a competency
evidenceEventSchema.index(
  { sourceType: 1, sourceId: 1, competencyId: 1 },
  { unique: true, partialFilterExpression: { sourceId: { $exists: true } } },
);

const EvidenceEvent = mongoose.model("EvidenceEvent", evidenceEventSchema);
export default EvidenceEvent;
