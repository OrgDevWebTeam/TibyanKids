# ADR-0002: API skeleton decisions

- Status: Accepted. Revised 2026-11-18: the first version described the TypeScript API that #41
  replaced. This version describes `apps/api` as it is now.
- Context: Express API (ADR-0005) needing input validation, rate limiting, security headers, safe
  error answers and an append-only audit log.
- Decisions:
  - **Plain JavaScript (ES modules)** on Node 22, no build step. `src/app.js` builds the Express app
    without listening, so tests drive it directly. `src/server.js` connects to MongoDB and listens.
  - **Folders by kind:** `src/routes`, `src/controllers`, `src/Models` (mongoose), `src/middlewares`,
    `src/validations` (zod), `src/utils`. The AI service client is in `src/ai`, the mission rules in
    `src/missions`.
  - **Environment check (zod)** at startup in `src/config/env.js`. A missing or invalid setting (for
    example a `JWT_SECRET` shorter than 32 characters, or no database) stops the server. It does not
    yet check for a local database or TLS in production (see `docs/SECURITY-GATES.md`, gate 8).
  - **Database:** mongoose (ADR-0003). There are no migrations: mongoose creates collections and
    indexes from the models.
  - **Security headers:** helmet. **CORS:** one allowed origin (`CLIENT_ORIGIN`). **Body limit:**
    10kb for JSON. Audio uploads go through multer, in memory, at most 5 MB.
  - **Rate limiting:** `/api/v1/auth` allows 20 requests per 15 minutes; the other routes
    allow 300 (`apiLimiter` in `middlewares/rateLimiter.js`). Health is not limited.
  - **Errors:** the error handler maps known errors (zod, mongoose, bad JSON, duplicate key) to
    4xx answers. Anything else returns `Server error` with no message or stack.
  - **Validation:** `validate(schema)` checks each request with a zod schema. Controllers pick
    the fields they save and never pass `req.body` straight into a model.
  - **Family scope:** child-owned data is always looked up with the family from the server
    (`Child.findOwned(childId, familyId)`, `utils/findMyChild.js`), never from the request.
- Tests: `node --test` with a throwaway MongoDB (mongodb-memory-server), in `apps/api/tests/`.
