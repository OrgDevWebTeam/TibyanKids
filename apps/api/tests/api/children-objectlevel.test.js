import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, stopTestApp, api, registerParent, createChild } from "../helpers/api.js";

describe("object-level authorization: children", () => {
  let a, b, child, id;

  before(async () => {
    await startTestApp();
    a = await registerParent(); // the owner
    b = await registerParent(); // a different family
    child = await createChild(a.token, { name: "Sara" });
    id = child._id;
  });
  after(stopTestApp);

  it("owner can read the child (positive control)", async () => {
    const res = await api(`/children/${id}`, { token: a.token });
    assert.equal(res.status, 200);
    assert.equal(res.json.child.name, "Sara");
  });

  it("another family cannot read the child", async () => {
    const res = await api(`/children/${id}`, { token: b.token });
    assert.equal(res.status, 404);
  });

  it("another family does not see the child in their list", async () => {
    const res = await api("/children", { token: b.token });
    assert.equal(res.status, 200);
    assert.equal(res.json.count, 0);
  });

  it("another family cannot update the child, and nothing changes", async () => {
    const res = await api(`/children/${id}`, {
      method: "PATCH",
      token: b.token,
      body: { name: "Hacked" },
    });
    assert.equal(res.status, 404);
    const after = await api(`/children/${id}`, { token: a.token });
    assert.equal(after.json.child.name, "Sara");
  });

  it("another family cannot archive the child, and it stays active for the owner", async () => {
    const res = await api(`/children/${id}/archive`, { method: "PATCH", token: b.token });
    assert.equal(res.status, 404);
    const after = await api(`/children/${id}`, { token: a.token });
    assert.equal(after.status, 200);
    assert.notEqual(after.json.child.status, "archived");
  });

  it("a client cannot choose the family or status when creating a child", async () => {
    const year = new Date().getFullYear() - 9;
    for (const extra of [{ familyId: a.familyId }, { status: "active" }]) {
      const res = await api("/children", {
        method: "POST",
        token: b.token,
        body: { name: "Sneaky", dateOfBirth: `${year}-03-15`, ...extra },
      });
      assert.equal(res.status, 400);
    }
  });

  it("anonymous requests are refused on every children route", async () => {
    const routes = [
      ["GET", "/children"],
      ["POST", "/children"],
      ["GET", `/children/${id}`],
      ["PATCH", `/children/${id}`],
      ["PATCH", `/children/${id}/archive`],
    ];
    for (const [method, path] of routes) {
      const res = await api(path, { method });
      assert.equal(res.status, 401, `${method} ${path} should be 401`);
    }
  });
});
