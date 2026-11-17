# ADR-0009: Mongoose and ObjectIds in the API

- Status: Proposed
- Amends: ADR-0003, only on three points: the Node.js driver, the id format and database-level validators.
- Context: The API was rebuilt on the `server` backend (PR #41): Express, mongoose and JWT sign-in. ADR-0003 asked for the official MongoDB Node.js driver, random UUID string ids and `$jsonSchema` validators. The models use mongoose and the standard MongoDB `ObjectId`. The web and AI teams agreed to move to this backend.
- Decision: Keep mongoose and `ObjectId`s. Everything else in ADR-0003 stays: MongoDB Atlas, tenant isolation in application code, transactions for multi-document changes, an append-only audit log, TLS and encryption at rest.

## What replaces each safeguard of ADR-0003

| ADR-0003 safeguard                              | How the API does it now                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repositories require `familyId` in every filter | `Child.findOwned(childId, familyId)`, the `loadFamily` middleware, and the shared model check `assertChildInFamily`. Negative tests cover cross-family access on every child route (`tests/api/*-objectlevel.test.js`, `audit-coverage.test.js`) |
| Opaque UUID ids to resist enumeration           | `ObjectId`s are not secret (they contain a time and a counter). Protected instead by object-level authorization on every route, the same 404 for "missing" and "another family's", rate limits, and an audit event for cross-family attempts     |
| Referential integrity in services, with tests   | Model validators, and transactions for registration, consent and content publishing                                                                                                                                                              |
| Audit immutability                              | Mongoose hooks refuse updates and deletes of audit events. A database user with insert-only rights is still needed in deployed environments and is not set up yet                                                                                |
| `$jsonSchema` validators on stable collections  | Not used. Mongoose schemas validate in the application and zod validates requests. A write that bypasses the application is not checked                                                                                                          |

## Consequences

- One language and one data layer for the backend, and the models already carry their rules (family scoping, consent, review).
- Ids are easier to guess than UUIDs, so authorization must stay strict on every route. A new route without an ownership check is a security bug.
- There is no database-level validation, so direct database writes are not checked.

## Follow-ups

1. Set up the insert-only database user for `audit_events` in staging and production (ADR-0003).
2. Decide whether the ids shown to clients should be opaque public ids before a public launch.
3. Consider a `$jsonSchema` validator for `audit_events`, the most sensitive collection.
