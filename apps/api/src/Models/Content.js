import mongoose from "mongoose";
import { AGE_BANDS, DOMAINS, LANGUAGES } from "../constants/index.js";

const contentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },

    type: {
      type: String,
      enum: ["lesson", "story", "activity", "quran_task", "mission"],
      required: true,
    },

    description: { type: String, trim: true },

    ageBand: { type: String, enum: AGE_BANDS, required: true },

    language: {
      type: String,
      enum: LANGUAGES,
      default: "ar",
      required: true,
    },

    domain: {
      type: String,
      enum: DOMAINS,
      required: true,
    },

    level: { type: Number, min: 1, max: 5, required: true },

    estimatedMinutes: { type: Number, min: 1, required: true },

    competencies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Competency" }],

    status: {
      type: String,
      enum: ["draft", "in_review", "published", "archived"],
      default: "draft",
    },

    reviewRequired: { type: Boolean, default: false },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    approvedAt: { type: Date },

    version: { type: Number, default: 1, min: 1 },

    // All versions of one piece of content share the id of its first version (FR-CMS-001).
    // Content created before versions existed has no rootId: its own _id is the root.
    rootId: { type: mongoose.Schema.Types.ObjectId, ref: "Content", immutable: true },

    // The published version this one was made from (null for a first version)
    previousVersion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Content",
      default: null,
      immutable: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
  },
  { timestamps: true },
);

contentSchema.pre("validate", function () {
  // A first version is the root of its own lineage
  if (this.isNew && !this.rootId) {
    this.rootId = this._id;
  }
  // Quran tasks and Family Loop missions always need a reviewer's approval before publishing
  // (safety doc 2.3: missions come from a reviewed table; ADR-0008).
  if (this.type === "quran_task" || this.type === "mission") {
    this.reviewRequired = true;
  }
  if (this.status === "published") {
    if (!this.competencies || this.competencies.length === 0) {
      this.invalidate("competencies", "Published content must map to at least one competency");
    }
    if (this.reviewRequired && (!this.reviewedBy || !this.approvedAt)) {
      this.invalidate(
        "reviewedBy",
        "Review-required content needs an approved reviewer before publishing",
      );
    }
    if (this.reviewedBy && this.createdBy && this.reviewedBy.equals(this.createdBy)) {
      this.invalidate("reviewedBy", "A reviewer cannot approve content they created");
    }
  }
});

contentSchema.index({
  status: 1,
  ageBand: 1,
  language: 1,
  domain: 1,
  level: 1,
});
contentSchema.index({ competencies: 1 });
// One version number per lineage. Content from before versions existed has no rootId and is skipped.
contentSchema.index(
  { rootId: 1, version: 1 },
  { unique: true, partialFilterExpression: { rootId: { $exists: true } } },
);

const Content = mongoose.model("Content", contentSchema);
export default Content;
