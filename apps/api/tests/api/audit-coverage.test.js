import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import AuditEvent from "../../src/Models/AuditEvent.js";
import { startTestApp, stopTestApp, api, registerParent, createChild } from "../helpers/api.js";

const consent = (childId, status) => ({ childId, status, policyVersion: "v1" });

describe("audit coverage (SEC-007)", () => {
  let a, id;

  before(async () => {
    await startTestApp();
    a = await registerParent();
    id = (await createChild(a.token))._id;
  });
  after(stopTestApp);

  it("granting consent writes a consent.granted event", async () => {
    const res = await api("/consents", {
      method: "POST",
      token: a.token,
      body: consent(id, "granted"),
    });
    assert.equal(res.status, 201);

    const events = await AuditEvent.find({ action: "consent.granted", targetId: id });
    assert.equal(events.length, 1);
    assert.equal(String(events[0].actorId), a.userId);
    assert.equal(events[0].actorRole, "parent");
    assert.equal(events[0].targetType, "Child");
    assert.equal(events[0].result, "success");
  });

  it("withdrawing consent writes a consent.withdrawn event", async () => {
    const res = await api("/consents", {
      method: "POST",
      token: a.token,
      body: consent(id, "withdrawn"),
    });
    assert.equal(res.status, 201);

    const events = await AuditEvent.find({ action: "consent.withdrawn", targetId: id });
    assert.equal(events.length, 1);
    assert.equal(String(events[0].actorId), a.userId);
  });

  it("a refused role check writes an access.denied event", async () => {
    // A parent is not allowed to create content.
    const res = await api("/content", { method: "POST", token: a.token, body: {} });
    assert.equal(res.status, 403);

    const events = await AuditEvent.find({ action: "access.denied", actorId: a.userId });
    assert.equal(events.length, 1);
    assert.equal(events[0].result, "denied");
  });

  it("audit events never contain child data, passwords or tokens", async () => {
    const events = await AuditEvent.find({ actorId: a.userId }).lean();
    assert.ok(events.length >= 3);
    const text = JSON.stringify(events);
    assert.ok(!text.includes("Sara"), "child name found in the audit log");
    assert.ok(!text.includes("password123"), "password found in the audit log");
    assert.ok(!text.includes(a.token), "token found in the audit log");
  });

  // SEC-007 categories that cannot be tested yet: nothing in the code writes them.
  it.todo("role changes write a role.changed event (no route changes roles yet)");
  it.todo("sensitive child-data access writes a child.data_accessed event");
  it.todo("administrative actions such as suspending a user write an event");
  it.todo("publishing content writes a content.published event (needs a content-admin user)");
});
