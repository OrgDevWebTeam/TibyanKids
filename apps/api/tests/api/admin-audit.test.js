import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditEvent from "../../src/Models/AuditEvent.js";
import {
  startTestApp,
  stopTestApp,
  api,
  apiRaw,
  registerParent,
  makeStaff,
} from "../helpers/api.js";

// Loaded after the test helper, because the audit code reads the settings the helper sets.
const { recordAudit } = await import("../../src/utils/audit.js");

const PATH = "/admin/audit-events";
const ALLOWED_FIELDS = [
  "_id",
  "actorId",
  "actorRole",
  "targetType",
  "targetId",
  "action",
  "result",
  "meta",
  "createdAt",
];

describe("admin audit view (FR-ADM-002)", () => {
  let platformAdmin;
  let contentAdmin;
  let parent;
  const actor = { _id: new mongoose.Types.ObjectId(), role: "parent" };

  before(async () => {
    await startTestApp();
    platformAdmin = await makeStaff("platform_admin");
    contentAdmin = await makeStaff("content_admin");
    parent = await registerParent();

    // 24 events of two kinds, written one after the other
    for (let i = 0; i < 24; i += 1) {
      await recordAudit({
        actor,
        action: i % 2 === 0 ? "consent.granted" : "consent.withdrawn",
        target: { type: "Child", id: new mongoose.Types.ObjectId() },
      });
    }
  });
  after(stopTestApp);

  it("refuses anonymous users, parents and other staff, and logs the refusals", async () => {
    assert.equal((await api(PATH)).status, 401);
    assert.equal((await api(PATH, { token: parent.token })).status, 403);
    assert.equal((await api(PATH, { token: contentAdmin.token })).status, 403);

    const denied = await AuditEvent.find({ action: "access.denied", actorId: parent.userId });
    assert.equal(denied.length, 1);
  });

  it("shows a platform admin the events, newest first, with the allowed fields only", async () => {
    const res = await api(`${PATH}?limit=10`, { token: platformAdmin.token });
    assert.equal(res.status, 200);
    assert.equal(res.json.items.length, 10);
    assert.equal(res.json.page, 1);
    assert.ok(res.json.total >= 24);
    assert.equal(res.json.pages, Math.ceil(res.json.total / 10));

    const times = res.json.items.map((item) => new Date(item.createdAt).getTime());
    for (let i = 1; i < times.length; i += 1) assert.ok(times[i - 1] >= times[i]);

    for (const item of res.json.items) {
      for (const key of Object.keys(item)) {
        assert.ok(ALLOWED_FIELDS.includes(key), `unexpected field ${key}`);
      }
    }
  });

  it("paginates without repeating events", async () => {
    const one = await api(`${PATH}?limit=10&page=1`, { token: platformAdmin.token });
    const two = await api(`${PATH}?limit=10&page=2`, { token: platformAdmin.token });
    const ids = [...one.json.items, ...two.json.items].map((item) => item._id);

    assert.equal(two.json.page, 2);
    assert.equal(new Set(ids).size, 20);
  });

  it("filters by action, actor, result and dates", async () => {
    const withdrawn = await api(`${PATH}?action=consent.withdrawn&limit=100`, {
      token: platformAdmin.token,
    });
    assert.equal(withdrawn.json.total, 12);
    assert.ok(withdrawn.json.items.every((item) => item.action === "consent.withdrawn"));

    const byActor = await api(`${PATH}?actorId=${actor._id}&limit=100`, {
      token: platformAdmin.token,
    });
    assert.equal(byActor.json.total, 24);

    // The parent's refused request above is visible to the admin
    const denied = await api(`${PATH}?result=denied&actorId=${parent.userId}`, {
      token: platformAdmin.token,
    });
    assert.equal(denied.json.total, 1);
    assert.equal(denied.json.items[0].action, "access.denied");

    const future = await api(`${PATH}?from=2999-01-01`, { token: platformAdmin.token });
    assert.equal(future.json.total, 0);
    const past = await api(`${PATH}?to=2000-01-01`, { token: platformAdmin.token });
    assert.equal(past.json.total, 0);
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const range = await api(`${PATH}?from=${today}&to=${tomorrow}&actorId=${actor._id}`, {
      token: platformAdmin.token,
    });
    assert.equal(range.json.total, 24);
  });

  it("refuses invalid filters and pagination", async () => {
    const bad = [
      "limit=1000",
      "limit=0",
      "page=0",
      "page=abc",
      "action=not.an.action",
      "result=maybe",
      "actorId=not-an-id",
      "targetId=123",
      "from=yesterday",
      "from=2026-12-01&to=2026-11-01",
      "unknown=1",
    ];
    for (const query of bad) {
      const res = await api(`${PATH}?${query}`, { token: platformAdmin.token });
      assert.equal(res.status, 400, `${query} should be refused`);
    }
  });

  it("is read-only: nothing can create, change or delete an event", async () => {
    const id = (await AuditEvent.findOne())._id;
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const path of [PATH, `${PATH}/${id}`]) {
        const res = await api(path, { method, token: platformAdmin.token, body: {} });
        assert.equal(res.status, 404, `${method} ${path} should not exist`);
      }
    }
    assert.ok(await AuditEvent.findById(id));
  });

  describe("export (CSV)", () => {
    const EXPORT = `${PATH}/export`;
    const HEADER = "createdAt,action,result,actorId,actorRole,targetType,targetId,meta";

    it("is only for a platform admin", async () => {
      assert.equal((await apiRaw(EXPORT)).status, 401);
      assert.equal((await apiRaw(EXPORT, { token: parent.token })).status, 403);
      assert.equal((await apiRaw(EXPORT, { token: contentAdmin.token })).status, 403);
    });

    it("downloads the filtered events as a CSV file", async () => {
      const res = await apiRaw(`${EXPORT}?action=consent.withdrawn`, {
        token: platformAdmin.token,
      });
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type"), /^text\/csv/);
      assert.match(res.headers.get("content-disposition"), /^attachment; filename="audit-events-/);
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.equal(res.headers.get("x-export-truncated"), "false");

      const lines = res.text.trim().split("\r\n");
      assert.equal(lines[0], HEADER);
      assert.equal(lines.length - 1, 12);
      assert.ok(lines.slice(1).every((line) => line.includes(",consent.withdrawn,")));
    });

    it("writes an audit.exported event, with the filter names and no values", async () => {
      const before = await AuditEvent.countDocuments({ action: "audit.exported" });
      await apiRaw(`${EXPORT}?action=consent.granted&result=success`, {
        token: platformAdmin.token,
      });

      const events = await AuditEvent.find({ action: "audit.exported" }).sort({ createdAt: -1 });
      assert.equal(events.length, before + 1);
      assert.equal(String(events[0].actorId), platformAdmin.id);
      assert.equal(events[0].meta.reason, "filters: action,result");
    });

    it("refuses invalid filters, and pagination parameters", async () => {
      for (const query of ["action=nope", "limit=5", "page=2", "from=2026-12-01&to=2026-11-01"]) {
        const res = await apiRaw(`${EXPORT}?${query}`, { token: platformAdmin.token });
        assert.equal(res.status, 400, `${query} should be refused`);
      }
    });

    it("keeps a spreadsheet from running a cell that starts like a formula", async () => {
      await recordAudit({
        actor: { _id: new mongoose.Types.ObjectId(), role: "=SUM(1+1)" },
        action: "content.archived",
        target: { type: "Content", id: new mongoose.Types.ObjectId() },
      });
      const res = await apiRaw(`${EXPORT}?action=content.archived`, {
        token: platformAdmin.token,
      });
      assert.ok(res.text.includes(",'=SUM(1+1),"));
      assert.ok(!res.text.includes(",=SUM(1+1),"));
    });

    it("stops at 5000 rows and says so", async () => {
      const base = {
        action: "user.suspended",
        result: "success",
        actorRole: "platform_admin",
        targetType: "User",
      };
      await AuditEvent.insertMany(Array.from({ length: 5001 }, () => ({ ...base })));

      const res = await apiRaw(`${EXPORT}?action=user.suspended`, { token: platformAdmin.token });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-export-truncated"), "true");
      assert.equal(res.text.trim().split("\r\n").length, 5001); // the header and 5000 rows
    });
  });
});
