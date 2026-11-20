# Family Loop (FR-FAM-001 to FR-FAM-004, API-005)

Date: 2026-11-18
Status: working. A completed lesson or story assigns a home mission, a parent records what they saw, the child can reflect, and the observation becomes light evidence in the Growth Map.

## What it is

The Family Loop connects learning to real life. After a child finishes a lesson or a story, the family gets a small mission to practise at home. The parent watches and says what happened. The child says how it felt. The parent's observation counts as weak evidence for the competencies the mission trains.

| CRS requirement | What it says                                                                 | Where it is built                                                                                     |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| FR-FAM-001      | A lesson or story can assign a family mission linked to a competency         | `assignMission`, `assignMissionForProgress`, and the hook in `Progress.js`                            |
| FR-FAM-002      | A parent records independent, after a reminder, or not observed, with a note | `ParentObservation`, `observeMission`, `POST .../observe`                                             |
| FR-FAM-003      | A child submits a simple reflection                                          | `ChildReflection`, `reflectOnMission`, `POST .../reflect`                                             |
| FR-FAM-004      | Mission evidence updates the Growth Map, and one observation is never proof  | `recordObservationEvidence`, weight 0.3, the level cap in `growthRules.js`                            |
| API-005         | Family mission endpoints, idempotent observation and reflection              | `src/controllers/missionController.js`, `src/routes/missionRoutes.js`, `src/routes/childrenRoutes.js` |

## The three records

| Entity              | Purpose                                           | Key fields                                                                                                   | Written by                             |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `MissionAssignment` | A mission given to one child                      | family, child, mission (a `Content` of type `mission`), source progress, reason, expiry date, completed date | The system                             |
| `ParentObservation` | What the parent saw. A fact, never edited         | assignment, status, note (500 characters at most), `clientObservationId`, who saved it                       | The parent                             |
| `ChildReflection`   | How the child felt. Fixed choices, never evidence | assignment, choice                                                                                           | The child, through the parent's device |

There is no stored status on an assignment. It is worked out from its dates: **completed** (observed), **expired** (its 7 days passed without an observation) or **pending**.

## How it works

1. A `Progress` record for a lesson or story becomes `completed`.
2. The hook records the growth evidence first (FR-GRW-002), then asks the mission service for a mission. The mission is chosen after the evidence, so it can use the updated Growth Map.
3. `selectMission` (ADR-0008) picks the mission from the published, age-eligible ones, and says why (`reasonRule`).
4. The parent sees the mission with `GET /children/:id/missions` and later submits an observation.
5. The observation, the completed date and the evidence are saved **in one transaction**: all of it, or none of it.
6. The child can then pick a reflection.

## The rules

All numbers are in `FAMILY_LOOP_RULES` in `src/missions/familyLoopRules.js`. The CRS gives no numbers, so these are the project's chosen starting rules.

| Rule                           | Value                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Mission lifetime               | 7 days from the day it is assigned                                                    |
| Open missions per child        | At most 3 (a fourth is not assigned until one is done or expired)                     |
| Note length                    | At most 500 characters                                                                |
| Content that triggers one      | Lessons and stories only                                                              |
| Observation to evidence        | `independent` is `met`. `reminder` is `partly_met`. `not_observed` is **no evidence** |
| Evidence weight                | 0.3, the lightest source (assessment 0.8, activity 0.5)                               |
| Growth level to mission status | Level 4 or 5 is `achieved`, level 3 `practising`, below that `needs_practice`         |
| Reflection choices             | `enjoyed_it`, `proud`, `want_more`, `was_hard`, `not_sure`                            |

"Not observed" is deliberately not evidence. A parent who could not watch has not shown that the child failed.

## The endpoints

All of them are for a signed-in **parent** and work on that parent's own children. Another family's child or mission gives 404 and is written to the audit log as `access.denied`.

Every action exists on two paths that behave the same, because both end in the same service functions:

| Action                  | Under the child (the child is in the URL)           | CRS paths (API-005)                    |
| ----------------------- | --------------------------------------------------- | -------------------------------------- |
| List a child's missions | `GET /children/:id/missions`                        | `GET /missions?childId=...`            |
| Observe a mission       | `POST /children/:id/missions/:assignmentId/observe` | `POST /missions/:assignmentId/observe` |
| Reflect on a mission    | `POST /children/:id/missions/:assignmentId/reflect` | `POST /missions/:assignmentId/reflect` |

On the CRS paths the child is worked out from the mission itself, and only if that mission belongs to the parent's family. `GET /missions` needs `?childId=` and accepts nothing else.

### List: `GET /api/v1/children/:id/missions` or `GET /api/v1/missions?childId=...`

The child's missions, newest first (the last 50).

```json
{
  "status": "success",
  "count": 1,
  "missions": [
    {
      "id": "...",
      "status": "pending",
      "assignedAt": "...",
      "expiresAt": "...",
      "completedAt": null,
      "reasonRule": "RULE_NOT_ASSESSED",
      "mission": {
        "id": "...",
        "title": "...",
        "description": "...",
        "estimatedMinutes": 5,
        "domain": "quran",
        "level": 1
      },
      "observation": null,
      "reflection": null
    }
  ]
}
```

### Observe: `POST .../missions/:assignmentId/observe`

```json
{ "status": "independent", "note": "Did it alone", "clientObservationId": "phone-1234" }
```

Only `status` is required. Any other field is refused with 400, so a client can never choose the child, the family, the result or the weight. Answers `201` with `{ duplicate: false, observation, evidenceRecorded }`. Sending the same `clientObservationId` again answers `200` with `duplicate: true` and saves nothing more.

### Reflect: `POST .../missions/:assignmentId/reflect`

```json
{ "choice": "proud" }
```

Answers `201` with `{ duplicate: false, reflection }`. Sending the same choice again is a safe retry: it answers `200` with `duplicate: true` and the first reflection. A different choice for the same mission is refused with 409.

### Errors

| Status | When                                                                                          |
| ------ | --------------------------------------------------------------------------------------------- |
| 400    | Invalid input: unknown status or choice, a note over 500 characters, an extra field, a bad id |
| 401    | Not signed in                                                                                 |
| 403    | Not a parent                                                                                  |
| 404    | The child or the mission does not exist, or belongs to another family (the same answer)       |
| 409    | The mission was already observed, has a different reflection already, or has expired          |

## Security and privacy

- **Family scoping (SEC-002).** A mission is found only with the child and the family of the request. The test suite proves that another family cannot read, observe or reflect on it.
- **Sensitive free text.** The parent's note is the only free text. It is limited to 500 characters and trimmed. The child's reflection has no free text at all.
- **Evidence is a fact.** Observations and reflections cannot be edited after they are saved.
- **Nothing is half-saved.** If recording the evidence fails, the observation is not saved either.
- **Never blocks the lesson.** If assigning a mission fails, the progress is still saved and the failure is logged with ids only.

## Where it differs from the CRS

- **Who submits (API-005).** The CRS names Child and Parent. No child sign-in exists, so for now only the parent calls these endpoints, including for the reflection. When child sign-in exists, the child's own token can be allowed on the reflection endpoint.

The CRS paths (`/missions`, `/missions/{id}/observe`, `/missions/{id}/reflect`) and the idempotent observation and reflection that API-005 asks for are both built.

## Files and tests

Files: `src/missions/familyLoopRules.js`, `src/missions/missionService.js`, `src/Models/MissionAssignment.js`, `src/Models/ParentObservation.js`, `src/Models/ChildReflection.js`, `src/validations/missionValidation.js`, `src/controllers/missionController.js`, `src/routes/missionRoutes.js`, `src/utils/inTransaction.js`, and the evidence function `recordObservationEvidence` in `src/growth/growthService.js`.

Tests: `tests/missions/familyLoopRules.test.js`, `tests/missions/missionService.test.js`, `tests/missions/autoAssign.test.js`, `tests/models/familyLoop.test.js`, `tests/models/observationEvidence.test.js`, `tests/validations/missions.test.js`, `tests/api/missions.test.js`, `tests/api/missions-crs-paths.test.js`.

## Not built yet

- A child's own sign-in, so a child cannot yet send a reflection themselves.
- A mission's instructions and parent prompt fields (see `data-dictionary.md`).
- A teacher's view of observations.
- Analytics events for the loop (`family_mission_assigned`, `parent_observation_recorded`) are defined in `analytics-events.md` but nothing sends them yet.
- Export and deletion of observations and reflections (SEC-015).
