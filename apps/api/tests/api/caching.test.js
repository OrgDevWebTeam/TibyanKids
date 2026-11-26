import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Competency from "../../src/Models/Competency.js";
import Content from "../../src/Models/Content.js";
import { startTestApp, stopTestApp, api, registerParent, makeStaff } from "../helpers/api.js";

// The helper turns the cache off. This file turns it on, before the app is loaded.
process.env.CACHE_TTL_SECONDS = "60";

describe("caching of curriculum and published content", () => {
  let parent;
  let admin;
  let competency;

  // Writes straight to the database, which does not clear the cache
  const makeContent = (title, status) =>
    Content.create({
      title,
      type: "lesson",
      ageBand: "9-11",
      language: "ar",
      domain: "character",
      level: 1,
      estimatedMinutes: 8,
      competencies: [competency._id],
      createdBy: new mongoose.Types.ObjectId(),
      status,
    });
  const makeCompetency = (code) =>
    Competency.create({ domain: "character", code, name: { ar: code, en: code } });

  before(async () => {
    await startTestApp();
    parent = await registerParent();
    admin = await makeStaff("content_admin");
    competency = await makeCompetency("HONESTY");
  });
  after(stopTestApp);

  it("a parent gets cached content, staff do not, and publishing clears it", async () => {
    const total = async (token) => (await api("/content", { token })).json.total;
    await makeContent("one", "published");
    assert.equal(await total(parent.token), 1);

    const draft = await makeContent("two", "draft");
    await makeContent("three", "published");
    assert.equal(await total(parent.token), 1, "the parent gets the cached list");
    assert.equal(await total(admin.token), 3, "staff are never cached");
    assert.equal((await api(`/content/${draft._id}`, { token: parent.token })).status, 404);

    const published = await api(`/content/${draft._id}/publish`, {
      method: "PATCH",
      token: admin.token,
    });
    assert.equal(published.status, 200);
    assert.equal(await total(parent.token), 3);
    assert.equal((await api(`/content/${draft._id}`, { token: parent.token })).status, 200);
  });

  it("competencies are cached, and a change through the API clears them", async () => {
    const path = `/curriculum/competencies/${competency._id}`;
    const total = async () =>
      (await api("/curriculum/competencies", { token: parent.token })).json.total;
    const name = async () => (await api(path, { token: parent.token })).json.competency.name.en;
    assert.equal(await total(), 1);
    assert.equal(await name(), "HONESTY");

    await makeCompetency("PATIENCE");
    assert.equal(await total(), 1, "the cached list");

    const res = await api(path, {
      method: "PATCH",
      token: admin.token,
      body: { name: { ar: "new", en: "new" } },
    });
    assert.equal(res.status, 200);
    assert.equal(await total(), 2);
    assert.equal(await name(), "new");
  });
});
