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

describe("content that suits a child's age (API-006)", () => {
  let parent;
  let stranger;
  let child; // nine years old: the 9-11 age band
  let youngChild; // seven years old: the 6-8 age band
  let strangersChild;
  let admin;
  let reviewer;
  let competency;
  const items = {};

  const list = (token, query = "") => api(`/content${query}`, { token });
  const titles = (res) => res.json.items.map((item) => item.title).sort();

  const makeContent = (title, type, ageBand, status = "published") =>
    Content.create({
      title,
      type,
      ageBand,
      language: "ar",
      domain: "character",
      level: 1,
      estimatedMinutes: 8,
      competencies: [competency._id],
      createdBy: newId(),
      status,
    });

  before(async () => {
    await startTestApp();
    parent = await registerParent();
    stranger = await registerParent();
    child = await createChild(parent.token);
    const year = new Date().getFullYear() - 7;
    youngChild = await createChild(parent.token, { name: "Young", dateOfBirth: `${year}-03-15` });
    strangersChild = await createChild(stranger.token);
    admin = await makeStaff("content_admin");
    reviewer = await makeStaff("reviewer");

    competency = await Competency.create({
      domain: "character",
      code: "HONESTY",
      name: { ar: "الصدق", en: "Honesty" },
    });
    items.midStory = await makeContent("mid story", "story", "9-11");
    items.midLesson = await makeContent("mid lesson", "lesson", "9-11");
    items.midDraft = await makeContent("mid draft", "lesson", "9-11", "draft");
    items.young = await makeContent("young activity", "activity", "6-8");
    items.older = await makeContent("older lesson", "lesson", "12-14");
  });
  after(stopTestApp);

  describe("the list", () => {
    it("without a child, nothing changes: every published item is listed", async () => {
      const res = await list(parent.token);
      assert.equal(res.status, 200);
      assert.deepEqual(titles(res), ["mid lesson", "mid story", "older lesson", "young activity"]);
    });

    it("for a child, only published content of the child's age band", async () => {
      const res = await list(parent.token, `?childId=${child._id}`);

      assert.equal(res.status, 200);
      assert.deepEqual(titles(res), ["mid lesson", "mid story"]);
      assert.equal(res.json.total, 2);
    });

    it("a child of another age band sees that band", async () => {
      const res = await list(parent.token, `?childId=${youngChild._id}`);
      assert.deepEqual(titles(res), ["young activity"]);
    });

    it("it still combines with the other filters and with paging", async () => {
      const stories = await list(parent.token, `?childId=${child._id}&type=story`);
      assert.deepEqual(titles(stories), ["mid story"]);

      const paged = await list(parent.token, `?childId=${child._id}&limit=1`);
      assert.equal(paged.json.items.length, 1);
      assert.equal(paged.json.total, 2);
      assert.equal(paged.json.pages, 2);
    });

    it("asking for another age band as well leaves nothing to show", async () => {
      const res = await list(parent.token, `?childId=${child._id}&ageBand=12-14`);
      assert.equal(res.status, 200);
      assert.deepEqual(res.json.items, []);
      assert.equal(res.json.total, 0);

      const same = await list(parent.token, `?childId=${child._id}&ageBand=9-11`);
      assert.deepEqual(titles(same), ["mid lesson", "mid story"]);
    });

    it("another family's child is a 404, and the attempt is audited", async () => {
      const before = await AuditEvent.countDocuments({
        action: "access.denied",
        targetId: strangersChild._id,
      });

      const res = await list(parent.token, `?childId=${strangersChild._id}`);

      assert.equal(res.status, 404);
      assert.equal(
        await AuditEvent.countDocuments({ action: "access.denied", targetId: strangersChild._id }),
        before + 1,
      );
    });

    it("a bad child id is a 400", async () => {
      assert.equal((await list(parent.token, "?childId=not-an-id")).status, 400);
    });

    it("the content team cannot use childId, and still lists everything they could", async () => {
      assert.equal((await list(admin.token, `?childId=${child._id}`)).status, 400);
      assert.equal((await list(reviewer.token, `?childId=${child._id}`)).status, 400);

      const all = await list(admin.token);
      assert.ok(titles(all).includes("mid draft"));
      const band = await list(admin.token, "?ageBand=9-11");
      assert.deepEqual(titles(band), ["mid draft", "mid lesson", "mid story"]);
    });

    it("needs a signed-in user", async () => {
      assert.equal((await list(undefined, `?childId=${child._id}`)).status, 401);
    });
  });

  describe("one item", () => {
    const one = (token, item, query = "") => api(`/content/${item._id}${query}`, { token });

    it("without a child, a parent can read any published item, as before", async () => {
      assert.equal((await one(parent.token, items.older)).status, 200);
      assert.equal((await one(parent.token, items.midDraft)).status, 404);
    });

    it("for a child, an item of their age band is returned", async () => {
      const res = await one(parent.token, items.midStory, `?childId=${child._id}`);
      assert.equal(res.status, 200);
      assert.equal(res.json.content.title, "mid story");
    });

    it("for a child, an item of another age band is a 404, like one that does not exist", async () => {
      assert.equal((await one(parent.token, items.older, `?childId=${child._id}`)).status, 404);
      assert.equal((await one(parent.token, items.young, `?childId=${child._id}`)).status, 404);
      assert.equal(
        (await one(parent.token, items.young, `?childId=${youngChild._id}`)).status,
        200,
      );
    });

    it("for a child, an item that is not published is still a 404", async () => {
      assert.equal((await one(parent.token, items.midDraft, `?childId=${child._id}`)).status, 404);
    });

    it("another family's child is a 404, a bad id is a 400, and staff cannot use childId", async () => {
      assert.equal(
        (await one(parent.token, items.midStory, `?childId=${strangersChild._id}`)).status,
        404,
      );
      assert.equal((await one(parent.token, items.midStory, "?childId=nope")).status, 400);
      assert.equal((await one(admin.token, items.midStory, `?childId=${child._id}`)).status, 400);
      // staff still read any status, without a child
      assert.equal((await one(admin.token, items.midDraft)).status, 200);
    });
  });
});
