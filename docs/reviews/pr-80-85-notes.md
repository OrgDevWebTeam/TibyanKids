# Notes: PR #80 and PR #85 (AI pipeline and recitation attempts)

Date: 2026-11-17
Reviewer: Mousa (backend)

Related: `docs/contracts/ai-result.md` (the contract between the API and the AI service).

## PR #80: real models behind the AI endpoint (merged)

Author: Qussai. Connects the real models to `POST /v1/recitation/analyze` (it used to answer 503 `MODELS_NOT_READY` when `MOCK_MODE=false`).

### Note for the API

Handle the new error codes. Any 5xx, a timeout or an unreachable service must produce the fallback result (`model: "none"`, decision `uncertain`) so the child is never stuck.

| Status | Code                                             | When                                                                  |
| ------ | ------------------------------------------------ | --------------------------------------------------------------------- |
| 400    | `AYAH_NOT_SUPPORTED`                             | Not one of the 25 prototype ayat. Checked first, also in mock mode    |
| 400    | `EMPTY_AUDIO`, `DECODE_FAILED`, `DECODE_TIMEOUT` | Unreadable audio. Not an attempt: the child records again             |
| 500    | `MODEL_FAILED`                                   | A model raised an unexpected error. The API saves an uncertain result |
| 500    | `INTERNAL_ERROR`                                 | Any other unexpected error, same shape                                |

Other behavior to know:

- A quality-gate rejection is a normal 200 answer with that `quality` value, decision `uncertain` and no findings. It is not an attempt.
- A whisper runaway (its text is a loop) is a 200 result: uncertain, no findings.
- The models run one request at a time (a lock), and `/health` keeps answering while a request waits.
- The AI service logs ids, numbers and codes only: no audio, transcripts, phonemes or names.
- Not tested on the GPU by the author: `DECODE_TIMEOUT` and a real model crash (covered by unit tests only).

## PR #85: send recitation attempts to the AI service (merged)

Author: Qussai. Rebuilds the attempts flow on the current Express and Mongoose API.

Endpoint: `POST /api/v1/children/:id/recitation-attempts` (multipart: `audio`, `clientAttemptId`, `surah`, `ayah`, `level`), parent only.

### How it handles the AI answers

| AI service answer                                        | API response                                                                           | Saved?        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------- |
| Valid result                                             | 201 with the attempt                                                                   | Yes           |
| 5xx, timeout, unreachable, not JSON, breaks the contract | 201, saved as an `uncertain` fallback with `aiFailure`                                 | Yes           |
| 400 `AYAH_NOT_SUPPORTED` or another 4xx                  | 201, fallback `bad_request` (the API checks the ayah first, so this should not happen) | Yes           |
| 400 `EMPTY_AUDIO`, `DECODE_FAILED`, `DECODE_TIMEOUT`     | 422 `{ status: "record_again", reason }`                                               | No            |
| 200 with a quality rejection                             | 200 `{ status: "record_again", reason: quality }`                                      | No            |
| Same `clientAttemptId` again                             | 200 with the saved attempt, no second analysis                                         | Already saved |

### Response shapes the web client must handle

| Status | Meaning                                                                                     |
| ------ | ------------------------------------------------------------------------------------------- |
| 201    | Attempt saved (a real result or an uncertain fallback)                                      |
| 200    | Either the same attempt again (`status: "success"`) or `record_again` with a quality reason |
| 422    | `record_again` with an audio error code                                                     |
| 400    | Invalid input, or an ayah outside the 25 prototype ayat                                     |
| 401    | Not signed in                                                                               |
| 403    | The child has no active consent                                                             |
| 404    | Child not found, or another family's child                                                  |
| 413    | Audio over 5 MB                                                                             |

Note that status 200 has two meanings. The client must look at the `status` field in the body.

### Review result

No blocking problem found. Reviewed by reading the diff on 2026-11-17. The tests were not run locally.

What is good:

- The child lookup is family-scoped and consent is checked before any audio is accepted (SEC-002, SEC-001).
- The AI service receives only the attempt id, surah, ayah, level and audio: no child or family id.
- The audio is never stored. The API logs only the attempt id and the failure reason.
- A repeated upload is safe: a unique index on child and `clientAttemptId`, and a duplicate race is handled.
- A down or slow AI service never blocks the child.
- 24 new tests cover each outcome.

CI on the PR head (`cb1c2f2`), checked on 2026-11-17: all 9 checks passed (Check, API integration tests, Container build, CodeQL, Secret scan, Dependency audit, AI service tests, PR title), and the PR was mergeable with no conflicts against `main`.

### Follow-ups (not blockers)

| #   | Follow-up                                                                                                                                 | Why                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | When another family's child is requested, write an `access.denied` audit event (use the `auditIfOtherFamily` helper once it is on `main`) | Matrix rule 6 and audit-review finding A1. The route currently answers 404 without logging                                                                       |
| 2   | Write an audit event for the attempt itself                                                                                               | SEC-007 "sensitive data access". The PR lists this as not done                                                                                                   |
| 3   | Add a dedicated, stricter rate limit for this route                                                                                       | SEC-008 asks for limits on recording upload and AI endpoints. Only the generic 300 per 15 minutes per IP applies, and each request can hold up to 5 MB in memory |
| 4   | Decide the audio retention policy                                                                                                         | SEC-006. The audio is dropped for now                                                                                                                            |
| 5   | Tell the web team about the response shapes above                                                                                         | The client note in PR #80 asks the client to handle the new error codes                                                                                          |
| 6   | Reading an attempt back and the session engine                                                                                            | Not in this PR (the PR says so)                                                                                                                                  |

### Merge notes

- PR #85 was merged into `main` (commit `8ab1983`) after this review. The follow-ups above are still open.
- Follow-up 1 needs the `auditIfOtherFamily` helper (`src/utils/auditCrossFamily.js`), which arrives with the PR that contains these notes. After that, the recitation controller can call `await auditIfOtherFamily(req, req.params.id)` before returning the 404.
- A later PR (email verification) adds an `AUTH_RATE_LIMIT` setting in `apps/api/.env.example` and `apps/api/src/config/env.js`, next to the `AI_SERVICE_URL` and `AI_TIMEOUT_MS` settings added by #85. Keep both sets when merging.
