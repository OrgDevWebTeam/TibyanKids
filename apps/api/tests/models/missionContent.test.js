// Family Loop missions are Content with type "mission" (ADR-0008). Like Quran tasks they always need
// a reviewer's approval before they can be published, whatever the author sets.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Content from "../../src/Models/Content.js";
import { createContentSchema } from "../../src/validations/contentValidation.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "../helpers/db.js";

const newId = () => new mongoose.Types.ObjectId();

const mission = (extra = {}) => ({
  title: "Help at the table",
  type: "mission",
  ageBand: "6-8",
  domain: "character",
  level: 1,
  estimatedMinutes: 10,
  competencies: [newId()],
  createdBy: newId(),
  ...extra,
});

describe("mission content", () => {
  before(connectTestDb);
  after(disconnectTestDb);
  beforeEach(clearTestDb);

  it("is accepted by the create request schema", () => {
    // The API takes the author from the session and links competencies separately
    const body = { ...mission() };
    delete body.createdBy;
    delete body.competencies;
    assert.ok(createContentSchema.safeParse(body).success);
  });

  it("always requires review, even when the author turns it off", async () => {
    const saved = await Content.create(mission({ reviewRequired: false }));
    assert.equal(saved.reviewRequired, true);
  });

  it("cannot be published without a reviewer's approval", async () => {
    const draft = await Content.create(mission());
    draft.status = "published";
    await assert.rejects(
      draft.save(),
      (err) => err.name === "ValidationError" && Boolean(err.errors.reviewedBy),
    );
  });

  it("can be published once someone else approved it", async () => {
    const draft = await Content.create(mission());
    draft.set({ status: "published", reviewedBy: newId(), approvedAt: new Date() });
    await draft.save();
    assert.equal(draft.status, "published");
  });

  it("cannot be approved by its author", async () => {
    const author = newId();
    const draft = await Content.create(mission({ createdBy: author }));
    draft.set({ status: "published", reviewedBy: author, approvedAt: new Date() });
    await assert.rejects(draft.save(), (err) => err.name === "ValidationError");
  });
});
