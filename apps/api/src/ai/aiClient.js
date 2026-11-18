// HTTP client for the internal AI service (services/ai). Owner: Qussai.
// Contract: docs/contracts/ai-result.md. The result is checked with the one shared zod schema
// (packages/contracts, aiResultSchema).
//
// Only the attempt id, surah, ayah, level and the audio are sent: no child id, family id or name
// crosses this boundary.
//
// Every call ends in one of three outcomes, so the caller never has to handle an exception:
//   { kind: "result", result }              the AI service answered with a valid result
//   { kind: "fallback", result, failure }   it was down, slow or wrong: an "uncertain" result to
//                                           save, so the session goes on and the teacher sees it
//   { kind: "record_again", code }          the audio cannot be read: not an attempt (VAL-014)
import { aiFallbackResult, aiResultSchema } from "@tibyan/contracts";

// The AI service's codes for audio it cannot read (docs/contracts/ai-result.md, "Errors")
export const AUDIO_ERROR_CODES = ["EMPTY_AUDIO", "DECODE_FAILED", "DECODE_TIMEOUT"];

/**
 * baseUrl: AI_SERVICE_URL. timeoutMs: AI_TIMEOUT_MS. fetchFn replaces fetch in tests.
 */
export function createAiClient({ baseUrl, timeoutMs, fetchFn = fetch }) {
  const url = new URL("/v1/recitation/analyze", baseUrl).toString();

  async function analyzeRecitation({ attemptId, surah, ayah, level, audio }) {
    const started = Date.now();
    const fallback = (failure) => ({
      kind: "fallback",
      result: aiFallbackResult(attemptId, Date.now() - started),
      failure,
    });

    const form = new FormData();
    form.set("attemptId", attemptId);
    form.set("surah", String(surah));
    form.set("ayah", String(ayah));
    form.set("level", level);
    form.set("audio", new Blob([audio.buffer], { type: audio.mimeType }), "recording");

    let response;
    try {
      response = await fetchFn(url, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
      return fallback(timedOut ? "timeout" : "unreachable");
    }

    let body;
    try {
      body = await response.json();
    } catch {
      return fallback("invalid_result");
    }

    if (!response.ok) {
      const code = body?.error?.code;
      // The child records again; the models never saw this audio
      if (response.status === 400 && AUDIO_ERROR_CODES.includes(code)) {
        return { kind: "record_again", code };
      }
      // Any other error (a model crash, or a request the API should never have sent)
      return fallback(response.status >= 500 ? "ai_error" : "bad_request");
    }

    const parsed = aiResultSchema.safeParse(body);
    // A result for another attempt is as bad as a malformed one
    if (!parsed.success || parsed.data.attemptId !== attemptId) {
      return fallback("invalid_result");
    }
    return { kind: "result", result: parsed.data };
  }

  return { analyzeRecitation };
}
