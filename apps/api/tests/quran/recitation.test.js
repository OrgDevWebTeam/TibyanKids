// POST /api/v1/children/:id/recitation-attempts with a fake AI client and an in-memory database.
// Owner: Qussai.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import { connectTestDb, clearTestDb, disconnectTestDb } from "../helpers/db.js";

// src/config/env.js checks these when the app is imported. Test values only; the JWT secret is
// random on every run, so no secret is written in this file.
process.env.NODE_ENV ??= "development";
process.env.DATABASE ??= "mongodb://test:<PASSWORD>@127.0.0.1:1/test";
process.env.DATABASE_PASSWORD ??= "test";
process.env.JWT_SECRET ??= randomBytes(32).toString("hex");

const { default: app } = await import("../../src/app.js");
const { signToken } = await import("../../src/utils/token.js");
const { default: User } = await import("../../src/Models/User.js");
const { default: Family } = await import("../../src/Models/Family.js");
const { default: Child } = await import("../../src/Models/Child.js");
const { default: ConsentRecord } = await import("../../src/Models/ConsentRecord.js");
const { default: QuranAttempt } = await import("../../src/Models/QuranAttempt.js");
const { PROTOTYPE_AYAT } = await import("../../src/validations/recitationValidation.js");

let server;
let baseUrl;
let aiCalls;

// The fake AI client answers with this outcome; the attemptId is filled in from the request
let nextOutcome;

function aiResult(overrides = {}) {
  return {
    model: "combined",
    modelVersion: "test",
    decision: "accepted",
    quality: "ok",
    findings: [],
    processingMs: 900,
    ...overrides,
  };
}

const fakeAiClient = {
  async analyzeRecitation(request) {
    aiCalls.push(request);
    const outcome = structuredClone(nextOutcome);
    if (outcome.result) outcome.result.attemptId = request.attemptId;
    return outcome;
  },
};

async function makeParent(email) {
  const parent = await User.create({ email, passwordHash: "not-used", role: "parent" });
  const family = await Family.create({ name: `${email} family`, parentId: parent._id });
  return { token: signToken(parent), parent, family };
}

async function makeChild({ family, parent }, { consent = true } = {}) {
  const child = await Child.create({
    name: "Child",
    dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 8, 0, 1)),
    familyId: family._id,
    status: "active",
  });
  if (consent) {
    await ConsentRecord.create({
      guardianId: parent._id,
      childId: child._id,
      familyId: family._id,
      status: "granted",
      policyVersion: "test",
      method: "web_form",
    });
  }
  return child;
}

function upload(token, childId, fields = {}, audio = Buffer.from("fake audio")) {
  const form = new FormData();
  const values = { clientAttemptId: "rec-1", surah: "1", ayah: "1", level: "beginner", ...fields };
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  if (audio) form.set("audio", new Blob([audio], { type: "audio/webm" }), "recording.webm");
  return fetch(`${baseUrl}/api/v1/children/${childId}/recitation-attempts`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
}

describe("recitation attempts", () => {
  before(async () => {
    await connectTestDb();
    await QuranAttempt.init(); // the unique index (VAL-010) must exist before the tests
    app.locals.aiClient = fakeAiClient;
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    server.close();
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
    aiCalls = [];
    nextOutcome = { kind: "result", result: aiResult() };
  });

  it("knows the same 25 prototype ayat as the reference text", () => {
    const url = new URL(
      "../../../../packages/contracts/data/reference_quran_text.json",
      import.meta.url,
    );
    const surahs = JSON.parse(readFileSync(url, "utf-8"));
    const counts = Object.fromEntries(surahs.map((s) => [s.surah_id, s.ayahs.length]));
    assert.deepEqual(counts, { ...PROTOTYPE_AYAT });
  });

  it("saves the AI result and returns it, with the word segment to replay", async () => {
    const owner = await makeParent("a@test.dev");
    const child = await makeChild(owner);
    const finding = {
      wordIndex: 2,
      category: "memorization",
      code: "ERR_MEM_OMISSION",
      confidence: 0.91,
      wordStartMs: 520,
      wordEndMs: 1240,
      messageKey: "FEEDBACK_WORD_MISSED",
    };
    nextOutcome = { kind: "result", result: aiResult({ decision: "error", findings: [finding] }) };

    const response = await upload(owner.token, child._id);
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.attempt.result.decision, "error");
    assert.deepEqual(body.attempt.result.findings, [finding]);
    // The AI service saw the attempt's own id, nothing about the child or family
    assert.equal(aiCalls[0].attemptId, body.attempt._id);
    assert.deepEqual(Object.keys(aiCalls[0]).sort(), [
      "attemptId",
      "audio",
      "ayah",
      "level",
      "surah",
    ]);
    assert.equal(await QuranAttempt.countDocuments(), 1);
  });

  it("returns the saved attempt for the same recording, without a second analysis", async () => {
    const owner = await makeParent("a@test.dev");
    const child = await makeChild(owner);

    const first = await (await upload(owner.token, child._id)).json();
    const again = await upload(owner.token, child._id);

    assert.equal(again.status, 200);
    assert.equal((await again.json()).attempt._id, first.attempt._id);
    assert.equal(aiCalls.length, 1);
    assert.equal(await QuranAttempt.countDocuments(), 1);
  });

  it("saves an uncertain attempt when the AI service fails, so the child goes on", async () => {
    const owner = await makeParent("a@test.dev");
    const child = await makeChild(owner);
    nextOutcome = {
      kind: "fallback",
      failure: "timeout",
      result: aiResult({ model: "none", modelVersion: "none", decision: "uncertain" }),
    };

    const response = await upload(owner.token, child._id);
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.attempt.result.decision, "uncertain");
    assert.equal(body.attempt.aiFailure, "timeout");
  });

  it("asks to record again after a quality-gate rejection and saves nothing", async () => {
    const owner = await makeParent("a@test.dev");
    const child = await makeChild(owner);
    nextOutcome = {
      kind: "result",
      result: aiResult({ decision: "uncertain", quality: "too_noisy" }),
    };

    const response = await upload(owner.token, child._id);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "record_again", reason: "too_noisy" });
    assert.equal(await QuranAttempt.countDocuments(), 0);
  });

  it("asks to record again when the audio cannot be read and saves nothing", async () => {
    const owner = await makeParent("a@test.dev");
    const child = await makeChild(owner);
    nextOutcome = { kind: "record_again", code: "DECODE_FAILED" };

    const response = await upload(owner.token, child._id);

    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { status: "record_again", reason: "DECODE_FAILED" });
    assert.equal(await QuranAttempt.countDocuments(), 0);
  });

  it("does not let a parent upload for another family's child", async () => {
    const owner = await makeParent("a@test.dev");
    const other = await makeParent("b@test.dev");
    const child = await makeChild(owner);

    const response = await upload(other.token, child._id);

    assert.equal(response.status, 404);
    assert.equal(aiCalls.length, 0);
  });

  it("refuses audio for a child without active consent", async () => {
    const owner = await makeParent("a@test.dev");
    const child = await makeChild(owner, { consent: false });

    const response = await upload(owner.token, child._id);

    assert.equal(response.status, 403);
    assert.equal(aiCalls.length, 0);
  });

  it("rejects an ayah outside the prototype before calling the AI service", async () => {
    const owner = await makeParent("a@test.dev");
    const child = await makeChild(owner);

    const response = await upload(owner.token, child._id, { surah: "2", ayah: "255" });

    assert.equal(response.status, 400);
    assert.equal(aiCalls.length, 0);
  });

  it("rejects a request without audio or with a wrong level", async () => {
    const owner = await makeParent("a@test.dev");
    const child = await makeChild(owner);

    assert.equal((await upload(owner.token, child._id, {}, null)).status, 400);
    assert.equal((await upload(owner.token, child._id, { level: "expert" })).status, 400);
    assert.equal(aiCalls.length, 0);
  });

  it("rejects audio over 5 MB", async () => {
    const owner = await makeParent("a@test.dev");
    const child = await makeChild(owner);

    const response = await upload(owner.token, child._id, {}, Buffer.alloc(5 * 1024 * 1024 + 1));

    assert.equal(response.status, 413);
    assert.equal(aiCalls.length, 0);
  });

  it("needs a logged-in parent", async () => {
    const response = await upload(null, new mongoose.Types.ObjectId());
    assert.equal(response.status, 401);
  });
});
