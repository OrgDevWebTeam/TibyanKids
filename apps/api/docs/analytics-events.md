# Analytics Event Schema (CRS Section 12)

Date: 2026-11-16
Status: schema and tests only. There is no endpoint, storage or pseudonymisation code yet.
Schema: `src/validations/analyticsValidation.js`. Tests: `tests/validations/analytics.test.js`.

## Principles (CRS 12.1)

- No advertising identifiers in the child experience (SEC-009).
- Pseudonymous analytics ids only. The schema has no field for a child id, family id, user id, name or email.
- No raw child audio, free-text parent notes or sensitive child profile details. The schema has no free-text field: every value is a fixed choice, a bounded number, a boolean or a short id.
- Product analytics is separate from authoritative learning records (Progress, Assessment, ConsentRecord).
- Metrics are for product validation, not medical or psychological assessment.
- Every object is strict: a field that is not listed is rejected, so personal data cannot be added by accident (NFR-OBS-001).

## Envelope (every event)

| Field         | Type                                                       | Notes                                                                                           |
| ------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `eventId`     | UUID                                                       | Unique per event                                                                                |
| `name`        | one of the events below                                    | Unknown names are rejected                                                                      |
| `occurredAt`  | ISO date-time                                              |                                                                                                 |
| `actorType`   | `parent`, `child`, `teacher`, `staff`, `visitor`, `system` | Matches our roles. `staff` covers content admin, reviewer, platform admin and analytics support |
| `pseudonymId` | 32 to 64 lowercase hex characters                          | Opaque. A database id (24 hex) and an email are rejected                                        |
| `locale`      | `ar` or `en`                                               |                                                                                                 |
| `ageBand`     | `6-8`, `9-11`, `12-14` (optional)                          | Coarse band only, never a date of birth                                                         |
| `properties`  | per event, see below                                       | Strict: extra fields are rejected                                                               |

## Events by CRS Section 12 area

| Area             | Event                           | Properties                                                                           |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| Activation       | `guardian_verified`             | none                                                                                 |
| Activation       | `child_created`                 | none                                                                                 |
| Activation       | `baseline_completed`            | none                                                                                 |
| Activation       | `first_mission_started`         | `missionType` (`story`, `family`)                                                    |
| Child engagement | `session_started`               | none                                                                                 |
| Child engagement | `mission_started`               | `missionType`                                                                        |
| Child engagement | `mission_completed`             | `missionType`, `durationSeconds` (0 to 7200)                                         |
| Story conversion | `story_viewed`                  | `storyId`                                                                            |
| Story conversion | `story_mission_started`         | `storyId`                                                                            |
| Family Loop      | `family_mission_assigned`       | `missionId`                                                                          |
| Family Loop      | `parent_observation_recorded`   | `status` (`independent`, `reminder`, `not_observed`)                                 |
| Growth           | `growth_evidence_recorded`      | `domain`, `sourceType` (`assessment`, `activity`, `observation`)                     |
| Growth           | `next_goal_completed`           | `domain`                                                                             |
| Quran            | `quran_attempt_submitted`       | `surah` (1 to 114), `ayah` (1 to 286), `isRepeat`                                    |
| Quran            | `quran_ai_result_shown`         | `outcome` (`clear`, `uncertain`), `confidenceBand` (`low`, `medium`, `high`)         |
| Quran            | `quran_teacher_escalated`       | none                                                                                 |
| Quran            | `quran_review_completed`        | `turnaroundHours` (0 to 720)                                                         |
| Parent value     | `weekly_insight_opened`         | none                                                                                 |
| Parent value     | `recommended_action_interacted` | `interaction` (`viewed`, `accepted`, `dismissed`)                                    |
| Parent value     | `report_history_viewed`         | none                                                                                 |
| Quality          | `error_occurred`                | `errorCode`                                                                          |
| Quality          | `upload_failed`                 | `reason` (`too_large`, `unsupported_format`, `network`, `quality_rejected`, `other`) |
| Quality          | `content_flagged`               | `reason` (`incorrect`, `inappropriate`, `other`)                                     |
| Quality          | `consent_issue`                 | `kind` (`missing`, `withdrawn`)                                                      |
| Quality          | `support_ticket_created`        | `category` (`account`, `child_data`, `content`, `technical`, `other`)                |

Metrics such as DAU/WAU, streak distribution, funnels, review turnaround and escalation rate are computed from these events (timestamps and the pseudonym), not stored as separate fields.

## Not covered here

- **Safety metrics** (unauthorized access attempts, moderation flags, sensitive-data incidents, audit anomalies). Unauthorized attempts are already written to the audit log as `access.denied`. Proposal: compute the Safety metrics from the audit log, so security data is not copied into analytics. Needs PM confirmation.
- **No endpoint, storage or pseudonymisation yet.** When built, the pseudonym must be derived with a secret (for example an HMAC of the user id), and that secret must be added to `docs/secrets.md` (SEC-004).

## Open questions for the PM

1. Are the `properties` choices above (for example the `reason` and `category` lists) the right options?
2. Is the age band acceptable in analytics, or must it be removed (CRS 12.1: no sensitive child profile details)?
3. Where are events stored (a separate collection or a third-party tool)? A third-party tool needs the processor review in SEC-011 and OPS-009.
4. How long are analytics events kept?
5. Do child sessions emit events, or only parent sessions?
