import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditEvent from "../../src/Models/AuditEvent.js";
import { startTestApp, stopTestApp, api, registerParent, verifyEmailFor } from "../helpers/api.js";

const childBody = () => ({
  name: "Sara",
  dateOfBirth: `${new Date().getFullYear() - 9}-03-15`,
});

describe("verified email gate (FR-AUTH-001)", () => {
  let p;

  before(async () => {
    await startTestApp();
    p = await registerParent({ verified: false });
  });
  after(stopTestApp);

  it("an unverified parent cannot create a child", async () => {
    const res = await api("/children", { method: "POST", token: p.token, body: childBody() });
    assert.equal(res.status, 403);

    const list = await api("/children", { token: p.token });
    assert.equal(list.status, 200);
    assert.equal(list.json.count, 0);
  });

  it("an unverified parent cannot give consent", async () => {
    const res = await api("/consents", {
      method: "POST",
      token: p.token,
      body: {
        childId: new mongoose.Types.ObjectId().toString(),
        status: "granted",
        policyVersion: "v1",
      },
    });
    assert.equal(res.status, 403);
  });

  it("the refusals are written to the audit log", async () => {
    const events = await AuditEvent.find({ action: "access.denied", actorId: p.userId });
    assert.equal(events.length, 2);
    for (const event of events) {
      assert.equal(event.result, "denied");
      assert.equal(event.meta.reason, "email not verified");
    }
  });

  it("after verifying, the parent can create a child, who starts pending consent", async () => {
    await verifyEmailFor(p.email);
    const res = await api("/children", { method: "POST", token: p.token, body: childBody() });
    assert.equal(res.status, 201);
    assert.equal(res.json.child.status, "pending_consent");
  });
});
