# Security Review and Vulnerability Assessment (SEC-003 to SEC-011)

Date: 2026-11-22
Scope: `apps/api`, the AI service call (`services/ai`), and the parts of `apps/web` that touch children. Reviewed against CRS section 9 (SEC-003 to SEC-011) and `docs/SECURITY-GATES.md`.
Status: Steps 1 to 6 are done (checklist, evidence, tools, probes, ratings, fixes). Step 7, the sign-off in `docs/SECURITY-GATES.md`, is for the team once the open findings below have an owner and a decision.

## How to read the status

- **Met**: the requirement is satisfied and there is evidence.
- **Partly met**: some of it is done. The gap is written in the evidence.
- **Not met**: nothing satisfies it yet.
- **Outside the code**: depends on hosting, Atlas or another provider that is not chosen or not checked.
- **Not applicable**: the feature does not exist, with the reason.

A status is never a guess. Each one points at evidence in the section for that requirement.

## The requirements

All of these are "Must" in the CRS.

| ID      | The CRS says                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-003 | Sensitive data shall be encrypted in transit and at rest using platform or cloud standard strong cryptography.                                             |
| SEC-004 | Secrets and API keys shall be stored in managed secret or configuration facilities, never in source control.                                               |
| SEC-005 | Child data collection shall follow data minimization. Optional fields shall remain optional unless justified.                                              |
| SEC-006 | Audio recitations shall have an explicit purpose, a retention class and a deletion pathway.                                                                |
| SEC-007 | Audit logs shall cover consent, role changes, sensitive data access, content publication and administrative actions.                                       |
| SEC-008 | Rate limits and abuse controls shall protect authentication, recording upload, AI endpoints and public acquisition links.                                  |
| SEC-009 | No behavioral advertising or child profiling for advertising purposes in the child experience.                                                             |
| SEC-010 | AI prompts and requests shall exclude unnecessary personal data and defend against prompt-injection and data-leakage patterns where generative AI is used. |
| SEC-011 | Third-party SDKs and processors shall be inventoried and reviewed before the pilot. Child-facing pages shall minimize trackers.                            |

## Checklist with status

| ID      | Requirement (short)                                          | Status                               | Gate | Summary                                                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------ | ------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-003 | Data encrypted in transit and at rest                        | Partly met, rest outside the code    | 8    | Database TLS is enforced and tested. Passwords and tokens are hashed. API HTTPS and Atlas encryption at rest depend on hosting and Atlas.                                                                                                      |
| SEC-004 | Secrets managed, never in source control                     | Partly met, rest outside the code    | 6    | Nothing secret is in git and CI scans for it. No managed secret store exists yet because no host is chosen.                                                                                                                                    |
| SEC-005 | Data minimization                                            | Partly met                           | none | Required fields are few and the rest are optional. The full date of birth and the child's real name are stored, which needs a decision (S-4).                                                                                                  |
| SEC-006 | Audio: purpose, retention class, deletion path               | Partly met                           | none | The API never stores audio and the AI service removes its temporary copy. The retention class and deletion pathway are now written down in `audio-retention.md`, as a proposal for the PM and the AI team to confirm.                          |
| SEC-007 | Audit logs for consent, roles, access, publication and admin | Partly met                           | 10   | Consent, content and denied access are written. Role changes, suspensions and sensitive reads are not, because no route does them yet.                                                                                                         |
| SEC-008 | Rate limits on auth, upload, AI and public links             | Partly met                           | none | Auth has its own limit, and the recitation upload now has a stricter per-account limit (fixed, S-1). The proxy setting is configurable but must be set at deployment (S-2), and the limit store and the auth counting remain open (S-3, S-17). |
| SEC-009 | No ad profiling in the child experience                      | Met, runtime check pending           | 15   | No ad or tracker code in the web app or the API. The manual network-panel check in the security gates is still to be done.                                                                                                                     |
| SEC-010 | AI requests minimal and prompt-injection safe                | Met. Prompt injection not applicable | none | The AI only scores audio, with local models. No personal data is sent. There is no text prompt to inject into.                                                                                                                                 |
| SEC-011 | Third-party SDKs and processors inventoried                  | Partly met                           | none | The inventory is below. The pilot review, and the processors that are not chosen yet, remain.                                                                                                                                                  |

The "Gate" column is the matching number in `docs/SECURITY-GATES.md`. "none" means that list has no gate for the requirement.

## Evidence

### SEC-003: encryption in transit and at rest

**In transit**

- The database connection is checked at startup. Outside development the server refuses a `DATABASE` URL that is not `mongodb+srv://` or `tls=true`, that sets `tls=false`, or that points at a local database (`src/config/envRules.js`, used in `src/config/env.js`). It is tested in `tests/config/envRules.test.js`.
- HTTPS for the API is provided by the hosting platform. No host is chosen (`docs/DEPLOYMENT.md`), so it cannot be verified. **Outside the code.**
- The AI service is internal. `docker-compose.yml` runs it locally over plain HTTP. In staging and production that connection must stay on a private network or use TLS (`docs/secrets.md`). **Outside the code.**

**At rest**

- Passwords are stored only as bcrypt hashes (`src/controllers/authController.js`, cost 10) and are never returned (`select: false` on `passwordHash`).
- Email verification tokens are stored only as hashes, with an expiry.
- Tokens are HS256 JWTs signed with a secret of at least 32 characters (`src/utils/token.js`, `src/config/env.js`).
- Database storage encryption is an Atlas cluster setting. It cannot be checked from the code and must be confirmed for the chosen tier. **Outside the code.**

### SEC-004: secrets

- `.gitignore` excludes `.env` and `.env.*` and keeps only `.env.example`.
- Only `.env.example` and `apps/api/.env.example` are tracked. Across the whole git history the only env-like files ever added are `.env.example` files (checked with `git log --all --diff-filter=A`).
- `.env.example` holds placeholders. The JWT placeholder is deliberately too short, so a copied file cannot start the server with a known secret (`docs/secrets.md`).
- CI has a **Secret scan** job (gitleaks over the history) and a **Dependency audit** job (`pnpm audit --prod --audit-level=high`) in `.github/workflows/ci.yml`.
- The container runs as the non-root user `node`, and `.dockerignore` excludes `.env` files (`apps/api/Dockerfile`, `.dockerignore`). The AI service's containers do not (S-10).
- A scan of the full git history for secret patterns found nothing real (see Tool results below).
- The development mailer prints the verification link, which contains a token, to the console. It is development only: staging and production refuse the placeholder mailer.
- There is no managed secret store, because no host is chosen. Production secrets will go into the GitHub Environments and the host's secret facility (`docs/DEPLOYMENT.md`). **Outside the code.**

### SEC-005: data minimization

Personal data collected today:

| Data                                                                                                                 | Where                    | Required? | Why it is needed                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------- | -------------------------------------------------------------------------------------------------- |
| Parent name, email, password, accepted policy version                                                                | `POST /auth/register`    | Yes       | Account, contact, proof of the accepted policy                                                     |
| Parent country (a two-letter code)                                                                                   | `User.country`           | Optional  | Consent rules can depend on the jurisdiction (SEC-001)                                             |
| Family name                                                                                                          | `Family.name`            | Yes       | Created at registration                                                                            |
| Child name (50 characters)                                                                                           | `Child.name`             | Yes       | To address the child. The CRS profile lists no name field, so a nickname would be enough (S-4)     |
| Child date of birth                                                                                                  | `Child.dateOfBirth`      | Yes       | Gives the age band (6 to 8, 9 to 11, 12 to 14). The CRS profile lists "age band", not a date (S-4) |
| Home language, country (a two-letter code), interests, learning goals, Arabic level, Quran level, preferred schedule | `Child`                  | Optional  | Personalisation. Each is optional in the model and in the validation                               |
| Consent record: guardian, child, family, status, policy version, method                                              | `ConsentRecord`          | Yes       | Proof of consent (SEC-001)                                                                         |
| Parent observation note (500 characters)                                                                             | `ParentObservation.note` | Optional  | Sensitive free text. Limited, trimmed, never logged                                                |
| Child reflection                                                                                                     | `ChildReflection`        | Yes       | A fixed choice, no free text                                                                       |

The free-text child fields are bounded: at most 20 items of 50 or 100 characters, and 200 characters for the schedule. An optional field is never required by the validation.

### SEC-006: audio

- **Purpose.** A child's recording is sent to the AI service to be scored against the expected ayah (`src/controllers/recitationController.js`). It needs an active child with active consent, otherwise 403.
- **In the API.** The upload is read into memory (`multer.memoryStorage()`), limited to 5 MB and one file, and the type must start with `audio/` (`src/middlewares/audioUpload.js`). It is never written to disk or stored. `QuranAttempt` has no audio field, only the result (`src/Models/QuranAttempt.js`).
- **In the AI service.** To decode the recording it writes it to a temporary folder that is removed when decoding ends (`services/ai/app/audio.py`, `tempfile.TemporaryDirectory`). The log entry for each analysis contains the attempt id, surah, ayah, level and timings. It has no audio, child id or family id (`services/ai/app/pipeline.py`).
- **Retention class and deletion path.** Written down in `docs/audio-retention.md` as a proposal: the recording is not retained, and there is nothing to delete. The note also says what must stay true, and that teacher review (FR-QUR-005, FR-QUR-006) will need stored audio later. The PM and the AI team still have to confirm it (S-6).

### SEC-007: audit logs

Reviewed in detail in `docs/audit-review.md`. Checked again against the code for this review:

| Event                                                                    | Written today? | Where                                                                                            |
| ------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------ |
| `consent.granted`, `consent.withdrawn`                                   | Yes            | `consentController` (`consent.${status}`), in a transaction                                      |
| `content.created`, `updated`, `version_created`, `published`, `archived` | Yes            | `contentController`                                                                              |
| `access.denied`                                                          | Yes            | Another family's child or mission, missing role, self-approval                                   |
| `audit.exported`                                                         | Yes            | `adminController`                                                                                |
| `role.changed`, `user.suspended`                                         | No             | No route changes a role or suspends a user yet                                                   |
| `child.data_accessed`                                                    | No             | Not decided which reads count as sensitive access (open question 8 in `authorization-matrix.md`) |

Tests: `tests/api/audit-coverage.test.js`. Three placeholders in it are marked `todo` for the events above that are not written.

### SEC-008: rate limits and abuse controls

| Route group                                                                                                                      | Limit                                        | Notes                                                  |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| `/api/v1/auth/*` (register, login, verify, resend)                                                                               | 20 per 15 minutes per IP (`AUTH_RATE_LIMIT`) | Stricter than the rest                                 |
| `/children` (including the recitation upload and the family loop), `/missions`, `/consents`, `/curriculum`, `/content`, `/admin` | 300 per 15 minutes per IP (`apiLimiter`)     | One shared general limit                               |
| `GET /api/v1/health`                                                                                                             | None                                         | Fine for a health check                                |
| AI endpoints                                                                                                                     | Only reachable through the recitation upload | The AI service is internal and not exposed to browsers |
| Public acquisition links                                                                                                         | Not applicable                               | No such route exists yet                               |

Other controls in place: JSON bodies are limited to 10 KB, uploads to 5 MB and one file, `helmet()` is on, CORS is limited to the configured origin, and a suspended account is refused on every request (`src/middlewares/authenticate.js`).

After the review: the recitation upload also has its own limit of 60 per 15 minutes per signed-in account (`UPLOAD_RATE_LIMIT`, `uploadLimiter` in `src/middlewares/rateLimiter.js`), and the number of proxies in front of the API is a setting (`TRUST_PROXY`, default 0). Gaps still open: S-3 and S-17, and setting `TRUST_PROXY` when the host is chosen (S-2).

### SEC-009: no advertising or ad profiling

- The web app depends only on a font package, React, the router and the internal packages (`apps/web/package.json`). The font is self-hosted through `@fontsource`, so no request goes to a font CDN.
- `apps/web/index.html` loads one script (the app itself), plus the icon and manifest. No external URL appears in the HTML, CSS or source.
- A search of `apps/web/src` and `index.html` for common advertising and tracker names (Google Analytics, Tag Manager, Facebook pixel, Hotjar, Segment, Mixpanel, AdSense, DoubleClick, Sentry, PostHog, Amplitude) found nothing.
- The API has no analytics or advertising dependency. The analytics schema (`docs/analytics-events.md`) is pseudonymous by design and nothing sends events yet.
- **Still to do:** the manual check D in `docs/SECURITY-GATES.md` (open the built app with the browser's network panel and confirm no request to an advertising domain). That is a runtime check, so the status is "Met, runtime check pending".

### SEC-010: AI requests

- **No generative model in the child's path.** `docs/ai/genai_and_safety_boundaries.md` states that the prototype uses no language model to explain, answer or chat. Everything the agent says to a child is pre-recorded. The AI only scores audio, with local models (`quran-muaalem`, `whisper-quran`, and faster-whisper for the Arabic track). Whisper transcripts never leave the AI service.
- **What the API sends** (`src/ai/aiClient.js`): `attemptId`, `surah`, `ayah`, `level` and the audio. The attempt id is a fresh id made for this attempt, not the child's or family's id (`recitationController`). No name, date of birth, family id or note is sent.
- **Prompt injection** needs a text prompt that carries user input. None exists, so it is **not applicable** today. It becomes relevant if the later parent-summary rewording model is approved, which needs a new decision.
- **Data leakage.** The result is validated against a schema and must carry the same attempt id (`aiResultSchema`), otherwise it is replaced by a safe fallback.
- The voice itself is personal data, and it is needed for the purpose, so it is not removed.

### SEC-011: third-party libraries and processors

**Libraries that ship (production dependencies)**

| Part                   | Dependencies                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`             | `bcrypt`, `cors`, `express`, `express-rate-limit`, `helmet`, `jsonwebtoken`, `mongoose`, `multer`, `zod`, `@tibyan/contracts`                                                                     |
| `apps/web`             | `react`, `react-dom`, `react-router`, `@fontsource-variable/baloo-bhaijaan-2`, `@tibyan/contracts`, `@tibyan/ui`                                                                                  |
| `apps/worker`          | `@tibyan/contracts`                                                                                                                                                                               |
| `packages/contracts`   | `zod`                                                                                                                                                                                             |
| `services/ai` (Python) | `fastapi`, `uvicorn`, `python-multipart`, `pydantic`. Model packages: `torch`, `numpy`, `transformers`, `quran-muaalem`, `quran-transcript`, `silero-vad`. Tests: `pytest`, `httpx`, `jsonschema` |

`pino`, `pino-http` and `pino-pretty` were installed in the API but never used. They were removed (S-8). None of the remaining libraries tracks users.

**Outside processors and services**

| Service                                                   | Used for                                | State                                                                   |
| --------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| MongoDB Atlas                                             | The database (child and family data)    | Chosen (ADR-0003). Region, tier and encryption at rest still to confirm |
| Hosting platform                                          | Running the API, web app and AI service | Not chosen                                                              |
| Email provider                                            | Verification emails                     | Not chosen. A placeholder mailer is used                                |
| GitHub and the GitHub container registry                  | Code, CI, images                        | In use. No child data                                                   |
| AI models (`tarteel-ai/whisper-base-ar-quran` and others) | Scoring recitations                     | Run locally inside the AI service. No child data leaves it              |

## Tool results (Step 3)

### Dependency audit (Node)

- `pnpm audit --prod --audit-level=high`, the command CI runs: **no known vulnerabilities**. Nothing that ships has a known high or critical issue (Gate 5).
- `pnpm audit` including development dependencies: **1 moderate** finding. `minimatch` has a possible denial of service through "globparts amplification" (advisory GHSA-g3hv-75wg-m249, vulnerable below 11.0.1). It is reached only through `eslint`, a development tool, in 60 dependency paths. It does not ship, and an attacker cannot reach it. Recorded as S-14.

### Secret scan

- **gitleaks** (the scan CI runs with `ghcr.io/gitleaks/gitleaks:v8.21.2`) could not be run for this review: Docker Desktop was not running. CI runs it on every pull request over the full history. Its latest result on the pull request is the authoritative one.
- Instead, the full git history (196 commits, all branches) was scanned for private keys, AWS keys, GitHub, Slack and OpenAI-style tokens, JWT values, database URLs with a password, and secrets assigned a literal value. Values were not printed. Four matches:
  - `apps/api/tests/api/isolation.test.js` and `apps/api/tests/helpers/api.js`: placeholder JWT secrets in test files. These are the known false positives already listed in `.gitleaksignore`. The current helper uses a random secret.
  - `apps/api/src/app.test.ts` and `apps/api/src/config/env.test.ts`: test fixtures using fake addresses such as `user:***@cluster0.example.mongodb.net`. They are example domains, and the files are no longer in the current tree.
- Result: no real credential found. This is a pattern scan, not a replacement for gitleaks.

### Code scanning (CodeQL)

CodeQL runs in CI (`.github/workflows/codeql.yml`). Its results are on GitHub and could not be read from here. On this pull request it reported two high-severity NoSQL-injection alerts in `src/missions/missionService.js`. The code was changed to pick request fields explicitly and compare ids as text, and the result of the re-run is to be confirmed on the pull request (Gate 7).

### Python dependencies and the AI service

- `pip-audit` is not installed here and the Python packages were not audited. CI does not audit them either (S-11).
- `requirements.txt` gives lower bounds only (`fastapi>=0.110,<1.0`, `uvicorn>=0.29`, `python-multipart>=0.0.9`), so a new build takes the newest version (S-12). The model packages in `requirements-gpu.txt` are pinned exactly.
- Both AI Dockerfiles (`Dockerfile`, `Dockerfile.gpu`) have no `USER` line, so the container runs as root (S-10).
- The AI service has no authentication. It relies on being reachable only from the API: `docker-compose.yml` binds it to `127.0.0.1` (S-13).
- Good practice found: the models are downloaded at a pinned revision (`check_revision` in `app/model_files.py`), and `trust_remote_code` is not used.

## Probe results (Step 4)

The API was started for real (development settings, the default auth rate limit) on a throwaway in-memory database, and attacked over HTTP with 62 probes. Nothing touched a real database. **59 behaved as expected. 3 differed**, and the differences are explained below.

| Area                   | What was tried                                                                                                                                           | Result                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Response headers       | `x-powered-by`, `x-content-type-options`, HSTS, CSP, frame options, referrer policy                                                                      | All as wanted. `x-powered-by` is not sent. HSTS is `max-age=31536000; includeSubDomains`.                                                                                                                      |
| CORS                   | A request and a preflight from another origin                                                                                                            | The header always names the one configured origin and never the caller's, so a browser on another site is blocked. See note 1 below.                                                                           |
| Authentication         | No token, a malformed token, a token signed with another secret, algorithm `none`, an expired token, a valid token for a user that does not exist        | All 401.                                                                                                                                                                                                       |
| Suspended account      | A valid token of a suspended user                                                                                                                        | 401, so a suspension takes effect at once.                                                                                                                                                                     |
| Injection              | Operator objects (`$ne`, `$regex`) as the login email and password, as the verify token, in a URL id, in `?childId[$ne]=x`, in an admin filter           | All refused (400, or 403 for a parent on the admin route). No operator reached the database.                                                                                                                   |
| Mass assignment        | Registering with `role: platform_admin`, `status`, `emailVerifiedAt`, and a `__proto__` payload. Creating a child with `status: active` and a `familyId` | The role stayed `parent`. The child request was refused with 400.                                                                                                                                              |
| Login behaviour        | Wrong password against an unknown email                                                                                                                  | The same 401 and the same body. The timing was 60 ms and 61 ms, so it does not reveal which emails exist.                                                                                                      |
| Tokens                 | Decoded a real token                                                                                                                                     | HS256, 7 days, carries only `userId`, `iat` and `exp`. No revoke or refresh (S-7).                                                                                                                             |
| Input handling         | A 20 KB body, invalid JSON, a form-encoded body, an unknown route, `PUT` and `DELETE` on `/children`                                                     | 413, 400, 400, 404, 404, 404. No stack trace or file path in any response.                                                                                                                                     |
| Role separation        | Parent, content admin, platform admin and anonymous callers on admin, content, curriculum, children and missions routes (9 combinations)                 | All as designed (401 or 403). The CSV export is sent as an attachment.                                                                                                                                         |
| Email gate and consent | An unverified parent creating a child. A new child's status                                                                                              | 403. The child is `pending_consent`.                                                                                                                                                                           |
| Recitation upload      | No token, another family's child, no consent, a 6 MB file, a non-audio file, two files, extra `childId` and `familyId` fields                            | 401, 404, 403, 413, 400, 400, and the extra fields are ignored (the attempt is saved for the child in the URL).                                                                                                |
| Rate limit, upload     | 320 requests to the upload route from one IP                                                                                                             | The first 429 came at request 268. The other 32 allowed requests were used by earlier probes, so **all routes share one budget of 300 per 15 minutes per IP**. There is no stricter limit on the upload (S-1). |
| Rate limit, auth       | Wrong logins, each with a different `X-Forwarded-For`                                                                                                    | 429 from the first attempt, because the earlier registrations and logins of the run had already used the 20 allowed. A spoofed header did not reset the count, so the header is not trusted.                   |

### The three differences

1. **CORS (2 probes): not a problem.** I expected no CORS header for another origin. The `cors` package, when given one fixed origin, sends that origin on every response. It never sends the caller's origin, so a page on another site cannot read the answer. My expectation was wrong, not the code.
2. **Registering an existing email answers `409 email already exists`.** That tells a stranger which emails have an account. It comes from the shared duplicate-key handler in `src/app.js`. This is a real finding (S-15).

### Other things noticed

- A weak password such as `12345678` is accepted. The only rule is a length of 8 to 72 characters (S-16).
- The auth limit counts every request, including successful ones, and counts per IP. Households or schools that share one public address share the 20 attempts per 15 minutes (S-17).

### What the probes did not cover

- No probe could trigger an unexpected 500, so the content of that error response (and the `console.error(err)` of S-9) was not tested.
- No load or denial-of-service testing, no test of the AI service itself, and no test of anything in staging or production, because none exists yet.
- The probe script is a throwaway. Turning its useful checks into automated tests is part of Step 6.

## Findings so far

These are the weaknesses seen while gathering evidence. They will be confirmed, rated and extended in Steps 3 to 5.

| #    | Requirement      | Finding                                                                                                                                                                            | Evidence                                                                                                                                                                       | Severity | Recommendation                                                                                                                                        | Status                                                  |
| ---- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| S-1  | SEC-008          | The recitation upload has only the general limit (300 requests per 15 minutes per IP). Each upload can be 5 MB held in memory and starts an AI call of up to 20 seconds.           | `src/routes/childrenRoutes.js` has `apiLimiter` only. `src/middlewares/audioUpload.js`. Confirmed by probe: the first 429 came after about 300 requests shared with all routes | Medium   | Add a stricter limiter on `POST /children/:id/recitation-attempts`, per account as well as per IP.                                                    | Fixed (Step 6)                                          |
| S-2  | SEC-008          | `trust proxy` is not set. Behind a load balancer every client appears with the proxy's address, so the limits are shared by all users, or can be bypassed by a spoofed header.     | `grep "trust proxy" src` finds nothing                                                                                                                                         | Medium   | Set it to the right number of proxies when the host is chosen, and test it in staging.                                                                | Partly fixed: set `TRUST_PROXY` when the host is chosen |
| S-3  | SEC-008          | The rate limiter keeps its counts in memory. With more than one API instance each one counts separately, so the real limit is multiplied.                                          | `src/middlewares/rateLimiter.js` uses the default store                                                                                                                        | Low      | Use a shared store when more than one instance runs.                                                                                                  | Open                                                    |
| S-4  | SEC-005          | The full date of birth and the child's name are stored. The CRS child profile lists an age band, not a date or a name.                                                             | `src/Models/Child.js`, CRS section 8                                                                                                                                           | Medium   | Decision for the PM: keep the date (the age band must stay current), store only month and year, and allow a nickname.                                 | Open                                                    |
| S-6  | SEC-006          | No document states the audio retention class and deletion pathway, and the AI service writes the recording to a temporary folder while decoding.                                   | `services/ai/app/audio.py`, comment in `src/Models/QuranAttempt.js`                                                                                                            | Medium   | Write the retention class ("not retained, deleted after analysis") and the deletion pathway, and keep the temp folder ephemeral.                      | Documented, to confirm with the PM and the AI team      |
| S-7  | SEC-003          | Tokens last 7 days by default and cannot be revoked. A suspended account is refused on every request, but a stolen token of an active account works until it expires.              | `src/config/env.js` (`JWT_EXPIRES_IN` default `7d`)                                                                                                                            | Low      | Use a shorter lifetime in staging and production, or add refresh tokens (a decision).                                                                 | Open                                                    |
| S-8  | SEC-011          | `pino` and `pino-http` are installed but never used. Unused libraries enlarge the attack surface and the inventory. Logging uses `console`.                                        | `apps/api/package.json`, no import in `src`                                                                                                                                    | Low      | Remove them, or use `pino` with redaction for logs.                                                                                                   | Fixed (Step 6)                                          |
| S-9  | SEC-003          | Unknown errors are logged as whole objects (`console.error(err)`). Such an error could carry values from a request.                                                                | `src/app.js` error handler                                                                                                                                                     | Low      | Log only the error name, message and stack, never the whole object.                                                                                   | Fixed (Step 6)                                          |
| S-10 | SEC-004, Gate 9  | The AI service containers run as root: neither Dockerfile has a `USER` line. The API container does run as `node`.                                                                 | `services/ai/Dockerfile`, `services/ai/Dockerfile.gpu`                                                                                                                         | Medium   | Create a non-root user in both images and run as it. Add the check to the container workflow.                                                         | Open                                                    |
| S-11 | SEC-011, Gate 5  | The Python dependencies of the AI service are never audited. CI audits only the Node dependencies.                                                                                 | `.github/workflows/ci.yml` (`ai-service` job runs install, pytest and a data check only)                                                                                       | Medium   | Add `pip-audit` to CI, and review its first result.                                                                                                   | Open                                                    |
| S-12 | SEC-011          | `requirements.txt` has lower bounds only, so a rebuild can pull a newer, untested, or vulnerable version.                                                                          | `services/ai/requirements.txt`                                                                                                                                                 | Low      | Pin exact versions, as `requirements-gpu.txt` does, or use a lock file.                                                                               | Open                                                    |
| S-13 | SEC-003, SEC-010 | The AI service has no authentication. Anyone who can reach port 8000 can send audio. Today it is bound to `127.0.0.1`, but in staging and production only the network protects it. | `services/ai/app/main.py`, `docker-compose.yml`                                                                                                                                | Medium   | Add a shared secret header checked by the AI service, and keep it on a private network.                                                               | Open                                                    |
| S-14 | SEC-011          | A moderate vulnerability in `minimatch` (denial of service) is reached through `eslint`. It is a development tool and does not ship.                                               | `pnpm audit` (GHSA-g3hv-75wg-m249)                                                                                                                                             | Low      | Update `eslint` when a release uses `minimatch` 11.0.1 or later.                                                                                      | Open                                                    |
| S-15 | SEC-008, SEC-005 | Registering with an email that already exists answers `409 email already exists`, so anyone can find out which emails have an account.                                             | Probe 'registering an existing email'. The message comes from the duplicate-key handler in `src/app.js`                                                                        | Low      | Answer the same way for new and existing emails, and tell the owner by email once a provider exists. Until then the auth rate limit slows harvesting. | Open                                                    |
| S-16 | SEC-003          | A weak password such as `12345678` is accepted. The only rule is a length of 8 to 72.                                                                                              | Probe 'a weak password', `src/validations/authValidation.js`                                                                                                                   | Low      | Refuse the most common passwords (a short deny list). Keep the maximum of 72, which is the bcrypt limit.                                              | Open                                                    |
| S-17 | SEC-008          | The auth limit counts successful requests too, per IP. Families sharing one public IP (a school, a mobile network) share the 20 attempts per 15 minutes.                           | Probes on the auth limiter, `src/app.js`                                                                                                                                       | Low      | Count only failed attempts, and limit per account as well as per IP.                                                                                  | Open                                                    |

S-5 is reserved for the free-text child fields. They are bounded and optional, so no finding was raised.

Findings from earlier reviews that still apply: staff accounts and MFA do not exist, so the admin audit view must not be deployed yet (F16 in `docs/authorization-review.md`, Gate 4).

## Final ratings and who must act (Step 5)

The probes confirmed S-1 and added S-15, S-16 and S-17. They did not lower or raise any other rating. **No finding is High.** None lets someone read another family's data, escalate a role, or reach the database with an injection. Of the 16 findings (S-5 was reserved and not used), 3 are fixed, 2 are fixed in part or documented, and 11 are open.

| Who acts                         | Findings                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Done in this review              | S-1 upload limit, S-8 unused packages, S-9 safe error logging. S-2 has its setting.                                                                                                              |
| API owner and PM (decisions)     | S-4 store the full date of birth and the child's name, S-7 token lifetime and revoking, S-15 registration reveals existing emails, S-16 password rules, S-17 count only failed logins.           |
| Hosting choice                   | S-2 set `TRUST_PROXY` to the real number of proxies, S-3 a shared store for the rate limits when more than one instance runs.                                                                    |
| AI team                          | S-10 non-root AI containers, S-11 audit the Python dependencies in CI, S-12 pin the Python versions, S-13 authenticate calls to the AI service, S-6 confirm that no copy of a recording is kept. |
| Whenever the dev tool is updated | S-14 `minimatch` in `eslint`.                                                                                                                                                                    |

## Fixes made (Step 6)

Each fix has an automated test (`apps/api/tests/api/security-hardening.test.js`). Each test was checked by removing the fix and seeing the test fail.

| Finding | Change                                                                                                                                                                                                             | Where                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| S-1     | A limit of 60 recitation uploads per signed-in account per 15 minutes (`UPLOAD_RATE_LIMIT`), counted per account and not per IP, applied before the upload is read. The answer is 429.                             | `src/middlewares/rateLimiter.js`, `src/routes/childrenRoutes.js`, `src/config/env.js` |
| S-2     | `TRUST_PROXY` (0 to 5, default 0) sets how many proxies are in front of the API. The default is unchanged. It must be set to the real number once a host is chosen.                                                | `src/app.js`, `src/config/env.js`, `.env.example`, `docs/secrets.md`                  |
| S-8     | `pino`, `pino-http` and `pino-pretty` removed from the API (they were never imported).                                                                                                                             | `apps/api/package.json`, `pnpm-lock.yaml`                                             |
| S-9     | An unexpected error is logged as its stack only (name, message, code locations), not as the whole error object, which can carry values from a request or from the database. The answer to the client is unchanged. | `src/app.js`                                                                          |
| S-6     | The retention class and deletion pathway are written down, with the conditions that must stay true and the effect of teacher review (FR-QUR-005, FR-QUR-006).                                                      | `docs/audio-retention.md`                                                             |

Not fixed now, and why:

- **S-15 and S-16** change what users see (the registration answer and the password rules). The registration answer cannot be made identical for new and existing emails without an email provider to tell the owner, and the usual test password `password123` is on every common-password list, so a deny list would also change every test and Postman request. They need a decision.
- **S-17** needs a decision on how to count: counting only failed logins must not make registration unlimited.
- **S-3, S-4, S-7** depend on the hosting choice or on the PM.
- **S-10 to S-13** are in `services/ai`, which belongs to the AI team, and the container changes cannot be tested here without Docker running.

## Not done yet

- **Step 3, what remains:** run gitleaks exactly as CI does (Docker was off), read the final CodeQL result on the pull request, and run `pip-audit` on the AI service.
- **Step 4, what remains:** no load testing, and staging and production do not exist yet. The answer to an unexpected 500 error is now covered by the test for S-9.
- **Step 7: sign-off.** Fill in the sign-off table in `docs/SECURITY-GATES.md` from this review.
- **Manual check D** (no advertising) with the browser's network panel.
