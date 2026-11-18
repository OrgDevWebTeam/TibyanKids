# ADR-0003: MongoDB as the primary transactional store

- Status: Accepted. Revised 2026-11-18: the API uses mongoose, not the official driver, and
  ids are MongoDB ObjectIds.
- Supersedes: Architecture v1.0 ADR-004 (PostgreSQL as primary transactional store).
- Context: The project team decided to use MongoDB instead of PostgreSQL.
- Decision: MongoDB (managed MongoDB Atlas for staging/production), accessed with **mongoose**.
  The models are in `apps/api/src/Models/`. Local development can use the single-node replica set
  in Docker Compose (`pnpm --filter @noor/api db:up`); tests start their own throwaway database.
- Consequences and required safeguards:
  - **Tenant isolation lives in application code.** There are no foreign keys and no row-level
    security. Every child-owned record carries `familyId`, and every lookup uses the family from
    the server (`Child.findOwned`), with cross-family tests (architecture 6.2, 13.3).
  - **Ids.** Ids are MongoDB ObjectIds. They are not secret, so access never depends on an id
    being hard to guess: the family check always runs.
  - **Referential integrity** (child belongs to family, child is active) is checked in model hooks
    (`utils/assertChildInFamily.js`) and covered by tests. Multi-document changes use transactions
    (replica set required): registration, consent changes, publishing.
  - **Audit immutability.** MongoDB has no triggers. The `AuditEvent` model blocks updates with
    hooks, and the application only inserts. 🔶 Deployed environments should also use a database
    user that can only insert and read audit events.
  - **Schema validation.** Mongoose schemas define each document's shape; request payloads are
    validated with zod.
  - **Cloud.** Use MongoDB Atlas (TLS, private networking, encryption at rest, backups on a paid
    tier). Amazon DocumentDB is not fully MongoDB-compatible and is not assumed.
  - **Architecture document amendments needed:** sections 1, 4.2, 4.3, 7 (data architecture),
    15.2, 18 (backups), 20 (vendor exit), the ERD figure and ADR-004. "JSONB" and "RDS-class"
    wording no longer apply.
