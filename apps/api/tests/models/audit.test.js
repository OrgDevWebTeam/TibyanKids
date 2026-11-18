import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AuditEvent from "../../src/Models/AuditEvent.js";
import { recordAudit } from "../../src/utils/audit.js";
import { connectTestDb, clearTestDb, disconnectTestDb } from "../helpers/db.js";

const newId = () => new mongoose.Types.ObjectId();
const admin = () => ({ _id: newId(), role: "platform_admin" });

describe("audit logging", () => {
  before(connectTestDb);
  after(disconnectTestDb);
  beforeEach(clearTestDb);

  it("saves a valid audit entry", async () => {
    const targetId = newId();
    const saved = await recordAudit({
      actor: admin(),
      action: "role.changed",
      target: { type: "User", id: targetId },
      meta: { fromRole: "parent", toRole: "teacher" },
    });
    assert.equal(saved.action, "role.changed");
    assert.equal(saved.result, "success");
    assert.ok(saved.targetId.equals(targetId));
    assert.ok(saved.createdAt);
  });

  it("rejects an unknown action name", async () => {
    await assert.rejects(
      recordAudit({ actor: admin(), action: "consnt.granted" }),
      /Unknown audit action/,
    );
  });

  it("rejects meta with a key that is not allowed", async () => {
    await assert.rejects(
      recordAudit({
        actor: admin(),
        action: "role.changed",
        meta: { password: "123" },
      }),
      (err) => err.name === "ValidationError" && Boolean(err.errors.meta),
    );
  });

  it("rejects meta with a value that is not short text", async () => {
    await assert.rejects(
      recordAudit({
        actor: admin(),
        action: "role.changed",
        meta: { reason: "x".repeat(201) },
      }),
      (err) => err.name === "ValidationError" && Boolean(err.errors.meta),
    );
    await assert.rejects(
      recordAudit({
        actor: admin(),
        action: "role.changed",
        meta: { reason: { nested: "object" } },
      }),
      (err) => err.name === "ValidationError" && Boolean(err.errors.meta),
    );
  });

  it("cannot update an existing entry with save()", async () => {
    const saved = await recordAudit({ actor: admin(), action: "user.suspended" });
    saved.result = "failure";
    await assert.rejects(saved.save(), /append-only/);
  });

  it("cannot update an entry with updateOne()", async () => {
    const saved = await recordAudit({ actor: admin(), action: "user.suspended" });
    await assert.rejects(
      AuditEvent.updateOne({ _id: saved._id }, { result: "failure" }),
      /append-only/,
    );
  });

  it("cannot delete an entry with deleteOne()", async () => {
    const saved = await recordAudit({
      actor: admin(),
      action: "role.changed",
      target: { type: "User", id: newId() },
    });
    await assert.rejects(() => AuditEvent.deleteOne({ _id: saved._id }), /append-only/);
    assert.equal(await AuditEvent.countDocuments({ _id: saved._id }), 1);
  });

  it("cannot delete entries with deleteMany() or findOneAndDelete()", async () => {
    const saved = await recordAudit({
      actor: admin(),
      action: "role.changed",
      target: { type: "User", id: newId() },
    });
    await assert.rejects(() => AuditEvent.deleteMany({}), /append-only/);
    await assert.rejects(() => AuditEvent.findOneAndDelete({ _id: saved._id }), /append-only/);
    assert.equal(await AuditEvent.countDocuments({ _id: saved._id }), 1);
  });

  it("cannot delete an entry through a loaded document", async () => {
    const saved = await recordAudit({
      actor: admin(),
      action: "role.changed",
      target: { type: "User", id: newId() },
    });
    await assert.rejects(() => saved.deleteOne(), /append-only/);
    assert.equal(await AuditEvent.countDocuments({ _id: saved._id }), 1);
  });

  it("cannot delete entries through bulkWrite()", async () => {
    const saved = await recordAudit({
      actor: admin(),
      action: "role.changed",
      target: { type: "User", id: newId() },
    });
    await assert.rejects(
      () => AuditEvent.bulkWrite([{ deleteOne: { filter: { _id: saved._id } } }]),
      /append-only/,
    );
    assert.equal(await AuditEvent.countDocuments({ _id: saved._id }), 1);
  });
});
