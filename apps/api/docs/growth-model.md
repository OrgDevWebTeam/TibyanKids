# Growth Model (FR-GRW-001)

Date: 2026-11-17
Status: models and tests only. Nothing writes evidence or derives the growth state yet.

## What it is

The Growth Map (FR-GRW-001) shows a child's growth across Faith, Quran, Arabic, Character and Future Skills. The CRS data dictionary (section 8) defines two entities behind it, and both now exist:

| Entity          | Purpose                                               | Key fields                                                                                                                      |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `EvidenceEvent` | One fact that supports a growth inference             | child, family, competency, domain (from the competency), source type, source id, weight (0 to 1), result, time                  |
| `GrowthState`   | The current derived state of one child and competency | child, family, competency, domain, status (`not_assessed` or `assessed`), level (0 to 5), confidence, evidence count, next goal |

Files: `src/Models/EvidenceEvent.js`, `src/Models/GrowthState.js`, `src/utils/applyCompetency.js`. Tests: `tests/models/growth.test.js`.

## Rules the models enforce

- **Family scoping (SEC-002).** Both carry `familyId` and `childId`, and a record is refused unless the child belongs to that family and is active (consent granted), the same shared check as `Progress` and `Assessment`.
- **Not assessed is not low (FR-GRW-001 acceptance).** A competency with no evidence is `not_assessed` and has no level, no confidence and no evidence. An `assessed` competency must have a level, a confidence and at least one piece of evidence. So "not assessed" and "assessed with level 0" can never be confused.
- **The competency decides the domain.** A new record needs an existing, active competency and takes its domain from it. A client cannot send a domain.
- **Evidence is a fact.** An `EvidenceEvent` is append-only: updating it fails with an error instead of being ignored. It can only be removed by the deletion workflow (SEC-015, VAL-008).
- **One state per child and competency** (unique index).
- **One observation is never definitive (VAL-005).** Every evidence event has a `weight` below or equal to 1, and there is no "mastered" status. The rule that stops a single event from raising a level belongs to the derivation, which is not built yet.

## Not built yet

- Anything that writes evidence: from an `Assessment`, from `Progress`, from a parent observation (FR-GRW-002, FR-FAM-004).
- The derivation of a `GrowthState` from evidence (level, confidence, next goal).
- `GET /children/{id}/growth` (API-004) and the parent view (FR-GRW-003).
- Export and deletion of evidence (SEC-015).

## Decisions needed from the PM

1. The meaning of `result` (`met`, `partly_met`, `not_met`) and of `weight`. They are a proposal built from the CRS wording ("source type, weight, result").
2. How the level and the confidence are derived from evidence, and the evidence threshold. It should be the same threshold the weekly insight uses (VAL-011, see `parent-intelligence-inputs.md`).
3. The minimum evidence needed for the highest levels, so that one observation cannot mark a competency as mastered (VAL-005).
4. How competency states are combined into the domain-level state that FR-GRW-001 lists as the output.
5. Which fields a teacher sees (limited read) and whether a child may read their own state.
6. Whether evidence is deleted, kept or anonymised when consent is withdrawn (VAL-008).
