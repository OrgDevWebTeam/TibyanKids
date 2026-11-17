import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditEvent from "../../src/Models/AuditEvent.js";
import Competency from "../../src/Models/Competency.js";
import { startTestApp, stopTestApp, api, registerParent, makeStaff } from "../helpers/api.js";

describe("content versions and audit trail (FR-CMS-001)", () => {
  let admin;
  let reviewer;
  let parent;
  let competencyId;

  const create = async (overrides = {}) => {
    const res = await api("/content", {
      method: "POST",
      token: admin.token,
      body: {
        title: "Lesson",
        type: "lesson",
        ageBand: "6-8",
        language: "ar",
        domain: "quran",
        level: 1,
        estimatedMinutes: 10,
        competencies: [competencyId],
        ...overrides,
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    return res.json.content;
  };
  const publish = (id) => api(`/content/${id}/publish`, { method: "PATCH", token: admin.token });
  const newVersion = (id, token = admin.token) =>
    api(`/content/${id}/new-version`, { method: "POST", token });
  const events = (action, targetId) => AuditEvent.find({ action, targetId });

  before(async () => {
    await startTestApp();
    admin = await makeStaff("content_admin");
    reviewer = await makeStaff("reviewer");
    parent = await registerParent();
    const competency = await Competency.create({
      domain: "quran",
      code: "T-1",
      name: { ar: "كفاءة", en: "Test competency" },
    });
    competencyId = String(competency._id);
  });
  after(stopTestApp);

  it("creating content starts a lineage and writes content.created", async () => {
    const content = await create();

    assert.equal(content.version, 1);
    assert.equal(content.rootId, content._id);
    assert.equal(content.previousVersion, null);

    const found = await events("content.created", content._id);
    assert.equal(found.length, 1);
    assert.equal(String(found[0].actorId), admin.id);
  });

  it("editing a draft writes content.updated with the field names only", async () => {
    const content = await create();
    const res = await api(`/content/${content._id}`, {
      method: "PATCH",
      token: admin.token,
      body: { title: "A brand new title" },
    });
    assert.equal(res.status, 200);

    const found = await events("content.updated", content._id);
    assert.equal(found.length, 1);
    assert.equal(found[0].meta.field, "title");
    assert.ok(!JSON.stringify(found[0]).includes("A brand new title"));
  });

  it("published content cannot be edited, and publishing writes content.published", async () => {
    const content = await create();
    assert.equal((await publish(content._id)).status, 200);

    const edit = await api(`/content/${content._id}`, {
      method: "PATCH",
      token: admin.token,
      body: { title: "Changed" },
    });
    assert.equal(edit.status, 409);
    assert.equal((await events("content.published", content._id)).length, 1);
  });

  describe("a new version of published content", () => {
    let first;
    let second;

    before(async () => {
      first = await create({ title: "Version test" });
      assert.equal((await publish(first._id)).status, 200);
    });

    it("is a draft copy linked to the published one, and writes content.version_created", async () => {
      const res = await newVersion(first._id);
      assert.equal(res.status, 201);
      second = res.json.content;

      assert.equal(second.version, 2);
      assert.equal(second.status, "draft");
      assert.equal(second.previousVersion, first._id);
      assert.equal(second.rootId, first._id);
      assert.equal(second.title, "Version test");
      assert.equal(second.createdBy, admin.id);
      assert.equal((await events("content.version_created", second._id)).length, 1);
    });

    it("is refused while a newer version is already in progress", async () => {
      assert.equal((await newVersion(first._id)).status, 409);
      // The draft itself is not published, so it cannot get a version either
      assert.equal((await newVersion(second._id)).status, 409);
    });

    it("archives the older version when it is published, and only one stays live", async () => {
      assert.equal((await publish(second._id)).status, 200);

      const old = await api(`/content/${first._id}`, { token: admin.token });
      assert.equal(old.json.content.status, "archived");
      const current = await api(`/content/${second._id}`, { token: admin.token });
      assert.equal(current.json.content.status, "published");

      assert.equal((await events("content.archived", first._id)).length, 1);
      assert.equal((await events("content.published", second._id)).length, 1);

      // A parent sees only the live version
      const list = await api("/content?domain=quran&limit=100", { token: parent.token });
      const ids = list.json.items.map((item) => item._id);
      assert.ok(ids.includes(second._id));
      assert.ok(!ids.includes(first._id));
    });

    it("keeps a history, readable from any version", async () => {
      for (const id of [first._id, second._id]) {
        const res = await api(`/content/${id}/versions`, { token: admin.token });
        assert.equal(res.status, 200);
        assert.equal(res.json.rootId, first._id);
        assert.deepEqual(
          res.json.versions.map((v) => v.version),
          [1, 2],
        );
      }
      const asReviewer = await api(`/content/${first._id}/versions`, { token: reviewer.token });
      assert.equal(asReviewer.status, 200);
    });

    it("cannot be made or read by a parent, and the refusals are audited", async () => {
      const make = await newVersion(first._id, parent.token);
      const read = await api(`/content/${first._id}/versions`, { token: parent.token });
      assert.equal(make.status, 403);
      assert.equal(read.status, 403);

      const denied = await AuditEvent.find({ action: "access.denied", actorId: parent.userId });
      assert.ok(denied.length >= 2);
    });
  });

  it("review-required content needs a new approval for every version", async () => {
    const task = await create({ type: "quran_task", title: "Quran task" });
    const approve = (id) =>
      api(`/content/${id}/approve`, { method: "PATCH", token: reviewer.token });
    const submit = (id) =>
      api(`/content/${id}/submit-review`, { method: "PATCH", token: admin.token });

    assert.equal((await submit(task._id)).status, 200);
    assert.equal((await approve(task._id)).status, 200);
    assert.equal((await publish(task._id)).status, 200);

    const res = await newVersion(task._id);
    assert.equal(res.status, 201);
    const next = res.json.content;
    assert.equal(next.reviewRequired, true);
    assert.equal(next.reviewedBy, undefined);
    assert.equal(next.approvedAt, undefined);

    // Not approved yet, so it cannot be published
    assert.equal((await publish(next._id)).status, 409);

    assert.equal((await submit(next._id)).status, 200);
    assert.equal((await approve(next._id)).status, 200);
    assert.equal((await publish(next._id)).status, 200);
  });

  it("answers 404 for content that does not exist", async () => {
    const missing = new mongoose.Types.ObjectId().toString();
    assert.equal((await newVersion(missing)).status, 404);
    const read = await api(`/content/${missing}/versions`, { token: admin.token });
    assert.equal(read.status, 404);
  });
});
