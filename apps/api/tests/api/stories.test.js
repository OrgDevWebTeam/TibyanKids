import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditEvent from "../../src/Models/AuditEvent.js";
import Competency from "../../src/Models/Competency.js";
import Content from "../../src/Models/Content.js";
import {
  startTestApp,
  stopTestApp,
  api,
  registerParent,
  createChild,
  makeStaff,
} from "../helpers/api.js";

const newId = () => new mongoose.Types.ObjectId();

describe("story mission endpoints (FR-STORY-001, FR-FAM-001, API-006)", () => {
  let parent;
  let stranger;
  let child; // nine years old: the 9-11 age band
  let youngChild; // seven years old: the 6-8 age band
  let strangersChild;
  let admin;
  let reviewer;
  let teacher;
  let competency;
  let story;
  let mission;

  const url = (storyId = story._id) => `/stories/${storyId}/mission`;
  const read = (token, storyId, childId) =>
    api(`${url(storyId)}${childId ? `?childId=${childId}` : ""}`, { token });
  const save = (token, body, storyId) => api(url(storyId), { method: "PUT", token, body });
  const publish = (token, storyId = story._id) =>
    api(`${url(storyId)}/publish`, { method: "PATCH", token });

  const makeContent = (type, overrides = {}) =>
    Content.create({
      title: `A ${type}`,
      description: `About the ${type}`,
      type,
      ageBand: "9-11",
      language: "ar",
      domain: "character",
      level: 1,
      estimatedMinutes: 8,
      competencies: [competency._id],
      createdBy: newId(),
      status: "published",
      ...(type === "mission" ? { reviewedBy: newId(), approvedAt: new Date() } : {}),
      ...overrides,
    });

  const body = (overrides = {}) => ({
    missionId: String(mission._id),
    outcomes: ["The child can explain why telling the truth matters"],
    vocabulary: [{ word: "truthful", meaning: "someone who says what is real" }],
    challenge: {
      prompt: "Your friend broke the cup. What do you do?",
      options: [{ text: "Say it was me" }, { text: "Say nothing" }],
    },
    ...overrides,
  });

  before(async () => {
    await startTestApp();
    parent = await registerParent();
    stranger = await registerParent();
    child = await createChild(parent.token);
    const year = new Date().getFullYear() - 7;
    youngChild = await createChild(parent.token, { dateOfBirth: `${year}-03-15` });
    strangersChild = await createChild(stranger.token);
    admin = await makeStaff("content_admin");
    reviewer = await makeStaff("reviewer");
    teacher = await makeStaff("teacher");

    competency = await Competency.create({
      domain: "character",
      code: "HONESTY",
      name: { ar: "الصدق", en: "Honesty" },
    });
    story = await makeContent("story");
    mission = await makeContent("mission");
  });
  after(stopTestApp);

  it("needs a signed-in user with the right role", async () => {
    assert.equal((await read(undefined, undefined, child._id)).status, 401);
    assert.equal((await save(undefined, body())).status, 401);
    assert.equal((await publish(undefined)).status, 401);

    // A parent can read the mission of a story, but not build or publish a package
    assert.equal((await save(parent.token, body())).status, 403);
    assert.equal((await publish(parent.token)).status, 403);
    // A reviewer reads packages, but does not build or publish them
    assert.equal((await save(reviewer.token, body())).status, 403);
    assert.equal((await publish(reviewer.token)).status, 403);
    // A teacher has no access
    assert.equal((await read(teacher.token)).status, 403);
  });

  it("refuses a bad package with a 400", async () => {
    const cases = [
      {},
      body({ missionId: "not-an-id" }),
      body({ status: "published" }),
      body({ createdBy: String(newId()) }),
      body({ outcomes: [""] }),
      body({ challenge: { prompt: "Question?", options: [{ text: "Only one" }] } }),
      body({
        challenge: { prompt: "Question?", options: [{ text: "A", correct: true }, { text: "B" }] },
      }),
    ];
    for (const bad of cases) {
      assert.equal((await save(admin.token, bad)).status, 400, JSON.stringify(bad).slice(0, 60));
    }
    assert.equal((await save(admin.token, body(), "not-an-id")).status, 400);
  });

  it("answers 404 for a story that does not exist, or content that is not a story", async () => {
    assert.equal((await save(admin.token, body(), newId())).status, 404);
    const lesson = await makeContent("lesson");
    assert.equal((await save(admin.token, body(), lesson._id)).status, 404);
  });

  it("refuses a mission that is not a mission with a 400", async () => {
    const activity = await makeContent("activity");
    const res = await save(admin.token, body({ missionId: String(activity._id) }));
    assert.equal(res.status, 400);
  });

  it("a content admin creates the package as a draft, and the audit log records it", async () => {
    const res = await save(admin.token, body());

    assert.equal(res.status, 201);
    assert.equal(res.json.package.status, "draft");
    assert.equal(res.json.package.storyId, String(story._id));
    assert.equal(res.json.package.outcomes.length, 1);
    assert.equal(res.json.package.challenge.options.length, 2);
    assert.equal(
      await AuditEvent.countDocuments({ action: "content.created", targetType: "StoryMission" }),
      1,
    );
  });

  it("a parent does not see the mission while the package is a draft", async () => {
    assert.equal((await read(parent.token, story._id, child._id)).status, 404);
  });

  it("the content team reads the draft package, and a teacher cannot", async () => {
    for (const who of [admin, reviewer]) {
      const res = await read(who.token);
      assert.equal(res.status, 200);
      assert.equal(res.json.package.status, "draft");
    }
    assert.equal((await read(teacher.token)).status, 403);
  });

  it("saving again replaces the draft", async () => {
    const res = await save(
      admin.token,
      body({
        outcomes: ["Telling the truth builds trust", "Honesty can be hard"],
        challenge: undefined,
      }),
    );
    assert.equal(res.status, 200);
    assert.equal(res.json.package.outcomes.length, 2);
    assert.equal(res.json.package.challenge.prompt, null);
    assert.equal(res.json.package.challenge.options.length, 0);

    // put the challenge back for the rest of the tests
    assert.equal((await save(admin.token, body())).status, 200);
  });

  it("a package that is not ready is answered with 409 and the list of problems", async () => {
    await Content.updateOne({ _id: story._id }, { $set: { status: "in_review" } });

    const res = await publish(admin.token);

    assert.equal(res.status, 409);
    assert.equal(res.json.message, "The package cannot be published yet");
    assert.deepEqual(res.json.problems, ["The story must be published"]);

    await Content.updateOne({ _id: story._id }, { $set: { status: "published" } });
  });

  it("publishes a complete package, and the audit log records it", async () => {
    const res = await publish(admin.token);

    assert.equal(res.status, 200);
    assert.equal(res.json.package.status, "published");
    assert.ok(res.json.package.publishedAt);
    assert.equal(
      await AuditEvent.countDocuments({ action: "content.published", targetType: "StoryMission" }),
      1,
    );
  });

  it("a published package cannot be published again, or edited", async () => {
    assert.equal((await publish(admin.token)).status, 409);
    assert.equal((await save(admin.token, body())).status, 409);
  });

  it("answers 404 when a story has no package", async () => {
    const other = await makeContent("story");
    assert.equal((await publish(admin.token, other._id)).status, 404);
    assert.equal((await read(admin.token, other._id)).status, 404);
  });

  it("a parent gets the mission of a published story for a child of the right age", async () => {
    const res = await read(parent.token, story._id, child._id);

    assert.equal(res.status, 200);
    assert.equal(res.json.story.id, String(story._id));
    assert.equal(res.json.mission.id, String(mission._id));
    assert.equal(res.json.mission.estimatedMinutes, 8);
    assert.equal(res.json.outcomes.length, 1);
    assert.equal(res.json.vocabulary[0].word, "truthful");
    assert.equal(res.json.challenge.options.length, 2);
    // Nothing internal reaches a family
    const text = JSON.stringify(res.json);
    assert.equal(text.includes("createdBy"), false);
    assert.equal(text.includes("draft"), false);
    assert.equal(text.includes("publishedBy"), false);
  });

  it("a child of another age band gets a 404", async () => {
    assert.equal((await read(parent.token, story._id, youngChild._id)).status, 404);
  });

  it("a parent must say which child, and only that", async () => {
    assert.equal((await read(parent.token, story._id)).status, 400);
    assert.equal((await read(parent.token, story._id, "not-an-id")).status, 400);
    const extra = await api(`${url()}?childId=${child._id}&familyId=${newId()}`, {
      token: parent.token,
    });
    assert.equal(extra.status, 400);
    const operator = await api(`${url()}?childId[$ne]=x`, { token: parent.token });
    assert.equal(operator.status, 400);
  });

  it("another family's child gets a 404, and the attempt is audited", async () => {
    const before = await AuditEvent.countDocuments({
      action: "access.denied",
      targetId: strangersChild._id,
    });

    const res = await read(parent.token, story._id, strangersChild._id);

    assert.equal(res.status, 404);
    const after = await AuditEvent.countDocuments({
      action: "access.denied",
      targetId: strangersChild._id,
    });
    assert.equal(after, before + 1);
    // The other family cannot read the mission for the first family's child either
    assert.equal((await read(stranger.token, story._id, child._id)).status, 404);
    // ...but can for their own
    assert.equal((await read(stranger.token, story._id, strangersChild._id)).status, 200);
  });

  it("a mission that is no longer published disappears for families, at once", async () => {
    await Content.updateOne({ _id: mission._id }, { $set: { status: "archived" } });
    assert.equal((await read(parent.token, story._id, child._id)).status, 404);
    await Content.updateOne({ _id: mission._id }, { $set: { status: "published" } });
    assert.equal((await read(parent.token, story._id, child._id)).status, 200);
  });
});
