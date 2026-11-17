// The AI service client (src/ai/aiClient.js) with a fake fetch: every outcome. Owner: Qussai.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAiClient } from "../../src/ai/aiClient.js";

const ATTEMPT_ID = "665f1c2b9d3e4a0012345678";

function validResult(overrides = {}) {
  return {
    attemptId: ATTEMPT_ID,
    model: "combined",
    modelVersion: "quran-muaalem 0.3.0 + whisper-quran x",
    decision: "error",
    quality: "ok",
    findings: [
      {
        wordIndex: 2,
        category: "memorization",
        code: "ERR_MEM_OMISSION",
        confidence: 0.91,
        wordStartMs: 520,
        wordEndMs: 1240,
        messageKey: "FEEDBACK_WORD_MISSED",
      },
    ],
    processingMs: 900,
    ...overrides,
  };
}

// A fake fetch that answers with this status and body, and remembers what it was sent
function answering(status, body) {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, { status, headers: { "content-type": "application/json" } });
  };
  return { fetchFn, calls };
}

function failing(error) {
  return async () => {
    throw error;
  };
}

function analyze(fetchFn) {
  const client = createAiClient({ baseUrl: "http://ai.test:8000", timeoutMs: 1000, fetchFn });
  return client.analyzeRecitation({
    attemptId: ATTEMPT_ID,
    surah: 1,
    ayah: 1,
    level: "beginner",
    audio: { buffer: Buffer.from("fake audio"), mimeType: "audio/webm" },
  });
}

describe("AI client", () => {
  it("returns a valid result as it is", async () => {
    const outcome = await analyze(answering(200, validResult()).fetchFn);

    assert.equal(outcome.kind, "result");
    assert.equal(outcome.result.decision, "error");
    assert.equal(outcome.result.findings[0].wordStartMs, 520);
  });

  it("sends only the attempt id, surah, ayah, level and audio", async () => {
    const { fetchFn, calls } = answering(200, validResult());
    await analyze(fetchFn);

    assert.equal(calls[0].url, "http://ai.test:8000/v1/recitation/analyze");
    const form = calls[0].options.body;
    assert.deepEqual([...form.keys()].sort(), ["attemptId", "audio", "ayah", "level", "surah"]);
    assert.equal(form.get("attemptId"), ATTEMPT_ID);
    assert.equal(form.get("surah"), "1");
    assert.equal(form.get("audio").type, "audio/webm");
  });

  it("falls back to uncertain when the AI service is too slow", async () => {
    const timeout = new DOMException("The operation timed out", "TimeoutError");
    const outcome = await analyze(failing(timeout));

    assert.equal(outcome.kind, "fallback");
    assert.equal(outcome.failure, "timeout");
    assert.equal(outcome.result.model, "none");
    assert.equal(outcome.result.decision, "uncertain");
    assert.deepEqual(outcome.result.findings, []);
    assert.equal(outcome.result.attemptId, ATTEMPT_ID);
  });

  it("falls back when the AI service cannot be reached", async () => {
    const outcome = await analyze(failing(new TypeError("fetch failed")));
    assert.equal(outcome.failure, "unreachable");
  });

  it("falls back on a model crash (500 MODEL_FAILED)", async () => {
    const body = { error: { code: "MODEL_FAILED", message: "whisper-quran failed" } };
    const outcome = await analyze(answering(500, body).fetchFn);

    assert.equal(outcome.kind, "fallback");
    assert.equal(outcome.failure, "ai_error");
  });

  for (const code of ["EMPTY_AUDIO", "DECODE_FAILED", "DECODE_TIMEOUT"]) {
    it(`asks to record again on ${code}`, async () => {
      const outcome = await analyze(answering(400, { error: { code, message: "x" } }).fetchFn);
      assert.deepEqual(outcome, { kind: "record_again", code });
    });
  }

  it("falls back on a request the API should never send (400 AYAH_NOT_SUPPORTED)", async () => {
    const body = { error: { code: "AYAH_NOT_SUPPORTED", message: "2:255" } };
    const outcome = await analyze(answering(400, body).fetchFn);

    assert.equal(outcome.kind, "fallback");
    assert.equal(outcome.failure, "bad_request");
  });

  it("falls back when the answer is not JSON", async () => {
    const outcome = await analyze(answering(200, "<html>oops</html>").fetchFn);
    assert.equal(outcome.failure, "invalid_result");
  });

  it("falls back when the result breaks the contract", async () => {
    const outcome = await analyze(answering(200, validResult({ decision: "maybe" })).fetchFn);
    assert.equal(outcome.failure, "invalid_result");
  });

  it("falls back when the result is for another attempt", async () => {
    const other = validResult({ attemptId: "000000000000000000000000" });
    const outcome = await analyze(answering(200, other).fetchFn);
    assert.equal(outcome.failure, "invalid_result");
  });
});
