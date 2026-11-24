// A story turned into a learning mission package (FR-STORY-001, CRS section 8: StoryMission).
// It links one story (a Content of type "story") to one family mission (a Content of type "mission")
// and holds what the package adds to them: the learning outcomes, the vocabulary and the decision
// challenge. The rules for when a package may be published are in missions/contentLinking.js.
import mongoose from "mongoose";
import Content from "./Content.js";
import { LINK_RULES } from "../missions/contentLinking.js";

export const STORY_MISSION_STATUSES = ["draft", "published", "archived"];

// How big each part may be. These are field sizes, not product rules.
export const STORY_MISSION_LIMITS = Object.freeze({
  outcomes: 10,
  outcomeLength: 200,
  vocabulary: 30,
  wordLength: 60,
  meaningLength: 200,
  promptLength: 300,
  options: 4,
  optionLength: 120,
});

const maxItems = (max, label) => ({
  validator: (items) => items.length <= max,
  message: `At most ${max} ${label}`,
});

const vocabularySchema = new mongoose.Schema(
  {
    word: { type: String, required: true, trim: true, maxlength: STORY_MISSION_LIMITS.wordLength },
    meaning: {
      type: String,
      required: true,
      trim: true,
      maxlength: STORY_MISSION_LIMITS.meaningLength,
    },
  },
  { _id: false },
);

const optionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: STORY_MISSION_LIMITS.optionLength,
    },
  },
  { _id: false },
);

const storyMissionSchema = new mongoose.Schema(
  {
    // The story. It cannot be changed: a package belongs to one story.
    storyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Content",
      required: true,
      immutable: true,
    },

    // The family mission the child gets after the story. It can change while the package is a draft.
    missionId: { type: mongoose.Schema.Types.ObjectId, ref: "Content", required: true },

    // What the child should understand after the story, one short sentence each
    outcomes: {
      type: [{ type: String, trim: true, maxlength: STORY_MISSION_LIMITS.outcomeLength }],
      validate: maxItems(STORY_MISSION_LIMITS.outcomes, "learning outcomes"),
    },

    // Words the story teaches
    vocabulary: {
      type: [vocabularySchema],
      validate: maxItems(STORY_MISSION_LIMITS.vocabulary, "vocabulary words"),
    },

    // The decision challenge: a question and a few choices
    challenge: {
      prompt: { type: String, trim: true, maxlength: STORY_MISSION_LIMITS.promptLength },
      options: {
        type: [optionSchema],
        validate: maxItems(STORY_MISSION_LIMITS.options, "challenge options"),
      },
    },

    status: { type: String, enum: STORY_MISSION_STATUSES, default: "draft" },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    // Filled in when the package is published
    publishedAt: { type: Date },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// The story and the mission must exist and be the right kind of content. Whether they may be linked
// (published, same age band, shared competency) is decided when the package is published.
async function assertKind(doc, path, type) {
  const found = await Content.findOne({ _id: { $eq: doc[path] } }).select("type");
  if (!found) {
    doc.invalidate(path, `The ${type} does not exist`);
  } else if (found.type !== type) {
    doc.invalidate(path, `The ${type} must be content of type ${type}`);
  }
}

storyMissionSchema.pre("validate", async function () {
  if (this.isNew && this.storyId) await assertKind(this, "storyId", "story");
  if ((this.isNew || this.isModified("missionId")) && this.missionId) {
    await assertKind(this, "missionId", "mission");
  }
});

storyMissionSchema.pre("validate", function () {
  // A safety net: a published package always has its learning outcomes
  if (this.status === "published") {
    const written = this.outcomes.filter((outcome) => outcome && outcome.trim());
    if (written.length < LINK_RULES.MIN_OUTCOMES) {
      this.invalidate("outcomes", "A published package needs at least one learning outcome");
    }
    if (!this.publishedAt) this.publishedAt = new Date();
  }

  // A challenge is a question with at least two choices
  const { prompt, options } = this.challenge;
  if (prompt && options.length < 2) {
    this.invalidate("challenge.options", "A challenge needs at least two options");
  }
  if (!prompt && options.length > 0) {
    this.invalidate("challenge.prompt", "Challenge options need a prompt");
  }
});

// One package per story
storyMissionSchema.index({ storyId: 1 }, { unique: true });
// Finding the packages that use a mission
storyMissionSchema.index({ missionId: 1 });

const StoryMission = mongoose.model("StoryMission", storyMissionSchema);
export default StoryMission;
