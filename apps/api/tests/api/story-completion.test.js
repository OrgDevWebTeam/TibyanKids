import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditEvent from "../../src/Models/AuditEvent.js";
import Competency from "../../src/Models/Competency.js";
import Content from "../../src/Models/Content.js";
import EvidenceEvent from "../../src/Models/EvidenceEvent.js";
import MissionAssignment from "../../src/Models/MissionAssignment.js";
import Progress from "../../src/Models/Progress.js";
import StoryMission from "../../src/Models/StoryMission.js";
import { STORY_LINK_REASON } from "../../src/missions/missionService.js";
import {
  startTestApp,
  stopTestApp,
  api,
  registerParent,
  createChild,
  makeStaff,
} from "../helpers/api.js";

const newId = () => new mongoose.Types.ObjectId();

describe("completing a story (FR-STORY-002, FR-FAM-001)", () => {
  let parent;
  let stranger;
  let child; // nine years old, with consent
  let noConsentChild;
  let strangersChild;
  let competency;
  let story;
  let linked;
  let admin;

  const complete = (token, childId, storyId, body) =>
    api(`/children/${childId}/stories/${storyId}/complete`, { method: "POST", token, body });

  const grantConsent = async (token, childId) => {
    const res = await api("/consents", {
      method: "POST",
      token,
      body: { childId, status: "granted", policyVersion: "v1" },
    });
    assert.equal(res.status, 201);
  };

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

  before(async () => {
    await startTestApp();
    parent = await registerParent();
    stranger = await registerParent();
    child = await createChild(parent.token);
    noConsentChild = await createChild(parent.token, { name: "No consent" });
    strangersChild = await createChild(stranger.token);
    await grantConsent(parent.token, child._id);
    await grantConsent(stranger.token, strangersChild._id);
    admin = await makeStaff("content_admin");

    competency = await Competency.create({
      domain: "character",
      code: "HONESTY",
      name: { ar: "الصدق", en: "Honesty" },
    });
    story = await makeContent("story");
    linked = await makeContent("mission", { level: 3, estimatedMinutes: 12 });
    await StoryMission.create({
      storyId: story._id,
      missionId: linked._id,
      outcomes: ["The child can explain why telling the truth matters"],
      createdBy: newId(),
      status: "published",
    });
  });
  after(stopTestApp);

  it("needs a signed-in parent", async () => {
    assert.equal((await complete(undefined, child._id, story._id)).status, 401);
    assert.equal((await complete(admin.token, child._id, story._id)).status, 403);
  });

  it("finishing a story saves the progress and gives the story's own mission", async () => {
    const res = await complete(parent.token, child._id, story._id);

    assert.equal(res.status, 201);
    assert.equal(res.json.created, true);
    assert.equal(res.json.progress.status, "completed");
    assert.equal(res.json.progress.storyId, String(story._id));
    assert.ok(res.json.progress.completedAt);
    assert.equal(res.json.mission.mission.id, String(linked._id));
    assert.equal(res.json.mission.mission.title, linked.title);
    assert.equal(res.json.mission.reasonRule, STORY_LINK_REASON);
    assert.ok(res.json.mission.expiresAt);
  });

  it("the mission is in the child's list, and the story is evidence in the Growth Map", async () => {
    const missions = await api(`/children/${child._id}/missions`, { token: parent.token });
    assert.equal(missions.json.count, 1);
    assert.equal(missions.json.missions[0].status, "pending");
    assert.equal(missions.json.missions[0].mission.id, String(linked._id));

    const growth = await api(`/children/${child._id}/growth`, { token: parent.token });
    const evidence = growth.json.recentEvidence[0];
    assert.equal(evidence.sourceType, "activity");
    // No score was sent, so only taking part is proven
    assert.equal(evidence.result, "partly_met");
  });

  it("finishing the same story again changes nothing", async () => {
    const first = await Progress.findOne({ childId: child._id });

    const res = await complete(parent.token, child._id, story._id);

    assert.equal(res.status, 200);
    assert.equal(res.json.created, false);
    assert.equal(res.json.progress.id, String(first._id));
    assert.equal(res.json.mission.mission.id, String(linked._id));
    assert.equal(await Progress.countDocuments({ childId: child._id }), 1);
    assert.equal(await MissionAssignment.countDocuments({ childId: child._id }), 1);
    assert.equal(await EvidenceEvent.countDocuments({ childId: child._id }), 1);
  });

  it("two requests at the same moment save one progress", async () => {
    const sameMoment = await makeContent("story");

    const both = await Promise.all([
      complete(parent.token, child._id, sameMoment._id),
      complete(parent.token, child._id, sameMoment._id),
    ]);

    assert.ok(both.every((r) => [200, 201].includes(r.status)));
    assert.equal(
      await Progress.countDocuments({ childId: child._id, contentId: sameMoment._id }),
      1,
    );
  });

  it("a story without a package gives the mission the rules choose", async () => {
    const plain = await makeContent("story");
    const missionForRules = await makeContent("mission", { level: 1, estimatedMinutes: 5 });

    const res = await complete(parent.token, child._id, plain._id);

    assert.equal(res.status, 201);
    assert.equal(res.json.mission.mission.id, String(missionForRules._id));
    assert.notEqual(res.json.mission.reasonRule, STORY_LINK_REASON);
  });

  it("a client cannot send a score or anything else", async () => {
    const fresh = await makeContent("story");
    for (const body of [{ score: 100 }, { status: "completed" }, { completedAt: "2020-01-01" }]) {
      assert.equal((await complete(parent.token, child._id, fresh._id, body)).status, 400);
    }
    assert.equal(await Progress.countDocuments({ contentId: fresh._id }), 0);
    // An empty body is fine
    assert.equal((await complete(parent.token, child._id, fresh._id, {})).status, 201);
  });

  it("a story that is not for this child is a 404, like one that does not exist", async () => {
    const draft = await makeContent("story", { status: "draft" });
    const olderBand = await makeContent("story", { ageBand: "12-14" });
    const lesson = await makeContent("lesson");

    for (const id of [draft._id, olderBand._id, lesson._id, newId()]) {
      assert.equal((await complete(parent.token, child._id, id)).status, 404);
    }
    assert.equal((await complete(parent.token, child._id, "not-an-id")).status, 400);
  });

  it("a child without consent is refused", async () => {
    const res = await complete(parent.token, noConsentChild._id, story._id);
    assert.equal(res.status, 403);
    assert.equal(await Progress.countDocuments({ childId: noConsentChild._id }), 0);
  });

  it("another family's child is a 404, and the attempt is audited", async () => {
    const before = await AuditEvent.countDocuments({
      action: "access.denied",
      targetId: strangersChild._id,
    });

    const res = await complete(parent.token, strangersChild._id, story._id);

    assert.equal(res.status, 404);
    assert.equal(
      await AuditEvent.countDocuments({ action: "access.denied", targetId: strangersChild._id }),
      before + 1,
    );
    assert.equal(await Progress.countDocuments({ childId: strangersChild._id }), 0);
  });

  it("a story the child had started is completed, not duplicated", async () => {
    const started = await makeContent("story");
    await Progress.create({
      familyId: child.familyId,
      childId: child._id,
      contentId: started._id,
      status: "in_progress",
    });

    const res = await complete(parent.token, child._id, started._id);

    assert.equal(res.status, 201);
    assert.equal(res.json.progress.status, "completed");
    assert.equal(await Progress.countDocuments({ childId: child._id, contentId: started._id }), 1);
  });
});
