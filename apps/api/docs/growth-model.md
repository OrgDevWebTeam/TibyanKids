# Growth Model (FR-GRW-001)

Date: 2026-11-17
Status: working. Evidence is recorded automatically, the growth state is derived by the rules below, and a parent can read the Growth Map.

## What it is

The Growth Map (FR-GRW-001) shows a child's growth across Faith, Quran, Arabic, Character and Future Skills. The CRS data dictionary (section 8) defines two entities behind it:

| Entity          | Purpose                                               | Key fields                                                                                                                      |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `EvidenceEvent` | One fact that supports a growth inference             | child, family, competency, domain (from the competency), source type, source id, weight (0 to 1), result, time                  |
| `GrowthState`   | The current derived state of one child and competency | child, family, competency, domain, status (`not_assessed` or `assessed`), level (0 to 5), confidence, evidence count, next goal |

Files: `src/Models/EvidenceEvent.js`, `src/Models/GrowthState.js`, `src/growth/growthRules.js`, `src/growth/growthService.js`, `src/controllers/growthController.js`. Tests: `tests/models/growth.test.js`, `tests/growth/growthRules.test.js`, `tests/models/growthService.test.js`, `tests/api/growth.test.js`.

## How evidence is created

- **A completed activity.** When a `Progress` record becomes `completed`, each active competency of its `Content` gets one piece of evidence (source `activity`). The score decides the result: 70 or more is `met`, 40 to 69 is `partly_met`, below 40 is `not_met`. No score means only that the child took part, so `partly_met`.
- **A completed story** (FR-STORY-002). A parent completes a story for a child with `POST /children/:id/stories/:storyId/complete`. It is a `Progress` record with no score, so it counts as an activity with `partly_met`: only taking part is proven. See `story-missions.md`.
- **A completed assessment.** When an `Assessment` becomes `completed`, each active competency of its domain gets one piece of evidence (source `assessment`). Its level decides the result: 4 or 5 is `met`, 2 or 3 is `partly_met`, 0 or 1 is `not_met`.
- **Once only.** The same source counts once for a competency (a unique index), so saving a record twice does not add evidence.
- **Never blocks the child.** If the Growth Map fails, the progress or assessment is still saved and the failure is logged with ids only.
- **A parent's observation** (FR-FAM-002, FR-FAM-004). When a parent records an observation of a family mission, each active competency of that mission gets one piece of evidence (source `observation`, weight 0.3, the lightest). `independent` is `met`, `reminder` is `partly_met`, and `not_observed` gives **no evidence**. See `family-loop.md`.

## How the growth state is derived

All numbers are in `GROWTH_RULES` in `src/growth/growthRules.js`. The CRS gives no numbers, so these are the project's chosen starting rules. Changing them means changing that one object and its tests.

| Rule                               | Value                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Result score                       | `met` counts 1, `partly_met` 0.5, `not_met` 0                                                                                              |
| Source weight                      | assessment 0.8, activity 0.5, observation 0.3                                                                                              |
| Level                              | The weighted average of the newest 10 pieces of evidence, times 5, rounded                                                                 |
| One event is never proof (VAL-005) | The level is capped by the amount of evidence: 1 piece reaches at most level 2, 2 pieces level 3, 3 or 4 pieces level 4, 5 or more level 5 |
| Confidence                         | `high`: at least 5 pieces and total weight 3. `medium`: at least 3 pieces and total weight 1.5. Otherwise `low`                            |
| Next goal                          | A competency never assessed comes first (lowest code), then the assessed one with the lowest level below 5, otherwise none                 |
| Domain level                       | The average of its assessed competencies, weighted by their evidence                                                                       |
| Domain confidence                  | The weakest of its competencies, and never above `low` when fewer than half of the domain's competencies are assessed                      |

## Not assessed is not low (FR-GRW-001 acceptance)

A competency or domain with no evidence is `not_assessed` and has no level, no confidence and no evidence. An `assessed` one must have all three. So "not assessed" and "assessed at level 0" can never be confused, in the models, the rules or the API.

## The endpoint

`GET /api/v1/children/:id/growth` (API-004), for the child's parent only. It lists all five domains, each with its status, level, confidence, competencies, next goal and totals, plus the five newest pieces of evidence. Another family's child gives 404 and is logged. It shows no family id.

## Other rules the models enforce

- **Family scoping (SEC-002).** Both models carry `familyId` and `childId`, and a record is refused unless the child belongs to that family and is active (consent granted).
- **The competency decides the domain.** A new record needs an existing, active competency and takes its domain from it.
- **Evidence is a fact.** An `EvidenceEvent` is append-only: updating it fails with an error. It can only be removed by the deletion workflow (SEC-015, VAL-008).
- **One state per child and competency** (unique index).

## Not built yet

- A teacher's limited read of the Growth Map (VAL-007) and a child's own read. No teacher or child sign-in exists yet.
- Export and deletion of evidence (SEC-015).
- The weekly insight that uses this data (FR-PAR-002, see `parent-intelligence-inputs.md`).
