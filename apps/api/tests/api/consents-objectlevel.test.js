import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, stopTestApp, api, registerParent, createChild } from "../helpers/api.js";

const consentBody = (childId, status = "granted") => ({
  childId,
  status,
  policyVersion: "v1",
});

describe("object-level authorization: consents", () => {
  let a, b, id;

  before(async () => {
    await startTestApp();
    a = await registerParent(); // the owner
    b = await registerParent(); // a different family
    id = (await createChild(a.token))._id;
  });
  after(stopTestApp);

  it("owner can read consent status and list (positive control)", async () => {
    const status = await api(`/consents/${id}/status`, { token: a.token });
    assert.equal(status.status, 200);
    assert.equal(status.json.childStatus, "pending_consent");
    assert.equal(status.json.hasActiveConsent, false);

    const list = await api(`/consents/${id}`, { token: a.token });
    assert.equal(list.status, 200);
    assert.equal(list.json.count, 0);
  });

  it("another family cannot read the consent list or status", async () => {
    assert.equal((await api(`/consents/${id}`, { token: b.token })).status, 404);
    assert.equal((await api(`/consents/${id}/status`, { token: b.token })).status, 404);
  });

  it("another family cannot grant consent, and the child stays pending", async () => {
    const res = await api("/consents", {
      method: "POST",
      token: b.token,
      body: consentBody(id),
    });
    assert.equal(res.status, 404);

    const status = await api(`/consents/${id}/status`, { token: a.token });
    assert.equal(status.json.childStatus, "pending_consent");
    const list = await api(`/consents/${id}`, { token: a.token });
    assert.equal(list.json.count, 0);
  });

  it("a client cannot choose the family or guardian when creating consent", async () => {
    const ownChild = (await createChild(b.token))._id;
    for (const extra of [{ familyId: a.familyId }, { guardianId: a.userId }]) {
      const res = await api("/consents", {
        method: "POST",
        token: b.token,
        body: { ...consentBody(ownChild), ...extra },
      });
      assert.equal(res.status, 400);
    }
  });

  it("owner can grant consent (positive control)", async () => {
    const res = await api("/consents", {
      method: "POST",
      token: a.token,
      body: consentBody(id),
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.childStatus, "active");
  });

  it("another family cannot withdraw consent, and the child stays active", async () => {
    const res = await api("/consents", {
      method: "POST",
      token: b.token,
      body: consentBody(id, "withdrawn"),
    });
    assert.equal(res.status, 404);

    const status = await api(`/consents/${id}/status`, { token: a.token });
    assert.equal(status.json.childStatus, "active");
    assert.equal(status.json.hasActiveConsent, true);
    const list = await api(`/consents/${id}`, { token: a.token });
    assert.equal(list.json.count, 1);
  });

  it("anonymous requests are refused on every consent route", async () => {
    const routes = [
      ["POST", "/consents"],
      ["GET", `/consents/${id}`],
      ["GET", `/consents/${id}/status`],
    ];
    for (const [method, path] of routes) {
      const res = await api(path, { method });
      assert.equal(res.status, 401, `${method} ${path} should be 401`);
    }
  });
});
