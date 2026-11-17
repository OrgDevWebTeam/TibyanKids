# Parent Intelligence Inputs (FR-PAR-002)

Date: 2026-11-16
Status: specification only. Nothing is implemented. Needs PM review.

## What it is

Parent Intelligence is the weekly insight for a parent about one linked child (CRS FR-PAR-002, API-011, screen SCR-P04). It summarizes progress, consistency and areas needing reinforcement, and gives at least one recommended action. In v1 it is a weekly, rules-based insight. Predictive risk, retention and coaching intelligence belong to the post-validation phase and are out of scope.

This document defines the inputs: what data may feed the insight, what must never feed it, and the rules the insight must follow.

## Requirements served

| ID                  | Requirement                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------- |
| FR-PAR-002          | Weekly parent insight: progress, consistency, areas needing reinforcement, recommended action |
| FR-PAR-003          | Parent can see historical weekly reports. Missing periods are shown transparently             |
| API-011             | `GET /children/{id}/insights/weekly`, parent only, no fabricated conclusions with sparse data |
| VAL-011             | No behavioral conclusion when evidence volume is below the threshold                          |
| VAL-005, FR-FAM-004 | One observation never classifies a trait or competency as mastered                            |
| FR-GRW-003          | Parent sees current level, recent evidence and next goal per domain                           |
| SEC-002             | Only the linked guardian can access the child's data                                          |
| VAL-008             | Withdrawn consent stops new processing that depends on it                                     |
| NFR-AI-001, VAL-006 | Model-derived results show confidence or uncertainty                                          |
| PG-06               | Real prototype evidence, at least one actionable recommendation, no unsupported claims        |

## Inputs

Only aggregates are used (counts, levels, enums, dates at day level).

| #   | Input                          | Used for                   | CRS entity                           | What may be used                                         | Status in the server today                                                                                                                                  |
| --- | ------------------------------ | -------------------------- | ------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Completed activities this week | Progress                   | `Progress` + `Content`               | Count per domain, completion day                         | Exists (`Progress.status`, `completedAt`; domain from `Content`)                                                                                            |
| 2   | Latest assessment level        | Progress                   | `Assessment`                         | Level 0 to 5 per domain, kind (baseline or follow-up)    | Exists (`Assessment.level`, `domain`, `kind`)                                                                                                               |
| 3   | Active days this week          | Consistency                | Timestamps of 1, 2, 5, 6             | Number of distinct days with any activity (0 to 7)       | Can be derived from existing timestamps. No session model                                                                                                   |
| 4   | Growth evidence per domain     | Progress, reinforcement    | `EvidenceEvent`, `GrowthState`       | Evidence count, level, confidence, a "not assessed" flag | Exists: `GrowthState` is filled automatically from completed activities and assessments (see `growth-model.md`) and read through `GET /children/:id/growth` |
| 5   | Family mission observations    | Consistency, reinforcement | `ParentObservation`                  | Counts of `independent`, `reminder`, `not_observed`      | Missing                                                                                                                                                     |
| 6   | Quran activity                 | Consistency, reinforcement | `QuranAttempt`, `AIRecitationResult` | Attempts, repeats, uncertain results, confidence band    | Missing (the AI service exists, but the attempts flow is not in this server)                                                                                |
| 7   | Teacher review status          | Reinforcement              | `TeacherReview`                      | Count reviewed and pending                               | Missing                                                                                                                                                     |
| 8   | Streak                         | Consistency                | `RewardEvent`                        | Streak length                                            | Missing (optional)                                                                                                                                          |
| 9   | Approved recommended actions   | Recommended action         | `FamilyMission` / rules              | The id of one approved item                              | Missing. v1 chooses by rules, not by AI                                                                                                                     |
| 10  | Previous periods               | History (FR-PAR-003)       | `WeeklyInsight`                      | Period start and end, whether a report exists            | Missing                                                                                                                                                     |

Summary: the server can supply inputs 1 and 2 today, and a rough version of 3. The rest need new models first. Input 4 now exists: the growth state is filled automatically and readable.

## What must never be an input

- Free-text parent observation notes (`ParentObservation.note`). They are sensitive and length-limited by VAL-004.
- Audio, transcripts, child reflection text, teacher note text or voice notes.
- Child name, date of birth, contact details, location, or any child or family id sent to an AI provider (personalization guardrail 3).
- Emotion or sentiment signals, until the AI team decides what personalization may use (open question in `docs/ai/personalization-genai-boundaries.md`).
- Data about other children or families: no benchmarking or population ranking (CRS section 12, Growth).
- Data from a child whose consent is not active (VAL-008), or whose profile is archived.

## Rules the insight must follow

1. **Evidence threshold (VAL-011).** If there is too little evidence in the period, the insight says so ("limited evidence") and makes no behavioral conclusion. Provisional starting point, to be confirmed: at least 3 evidence items on at least 2 different days in the 7-day period, per domain.
2. **One observation is never proof (VAL-005, FR-FAM-004).** A single observation cannot label a trait or competency as mastered or lacking.
3. **Not assessed is not needs support.** A domain with no evidence is shown as "not assessed".
4. **Show uncertainty (NFR-AI-001, VAL-006).** Quran items marked uncertain are reported as uncertain, never as a definitive result.
5. **At least one recommended action (FR-PAR-002).** It is picked from an approved set by rules. It is not invented and not written by a generative model (personalization guardrail 4; the prototype uses rules only).
6. **Supportive language.** No shame, no trait labeling, no negative labeling (FR-PAR-001 acceptance criteria).
7. **Missing periods are shown as missing (FR-PAR-003).** A week with no report is shown as a gap, not filled in.
8. **Access.** Only the linked parent, found through the family-scoped lookup. Another family gets 404. This needs an object-level test like the ones for children and consents (SEC-002).
9. **Consent.** No new insight is generated while consent is withdrawn (VAL-008).

## Shape of the weekly input

The insight is computed from one bundle per child and week, built on the server. The bundle carries counts and enums only, and no child or family id, name or free text.

```json
{
  "period": { "start": "2026-11-09", "end": "2026-11-15" },
  "ageBand": "9-11",
  "locale": "ar",
  "completedActivities": 5,
  "activeDays": 4,
  "evidenceByDomain": {
    "quran": { "evidenceCount": 4, "activeDays": 3, "level": 2, "confidence": "medium" },
    "arabic": { "evidenceCount": 0, "status": "not_assessed" }
  },
  "familyLoop": { "independent": 1, "reminder": 1, "notObserved": 0 },
  "quran": {
    "attempts": 6,
    "repeats": 2,
    "uncertain": 1,
    "teacherReviewed": 1,
    "teacherPending": 0
  },
  "previousPeriodAvailable": true
}
```

## Open questions for the PM

1. What is the evidence threshold (VAL-011)? The value above is provisional.
2. FR-PAR-002 lists "Evidence/analytics" as dependencies, but CRS 12.1 says to keep product analytics separate from learning records. Should the insight use only learning records (recommended), or also analytics events?
3. Who reviews the rules that choose the recommended action, and where is the approved set kept?
4. May a generative model ever write the narrative, or is it templates only? (Prototype: rules only.)
5. Are child reflection "sentiment choices" allowed as an input, or off-limits like other emotion signals?
6. When is the insight generated (day, time, time zone), and how is the parent notified (FR-NOT-001)?
7. How long are weekly insights kept? They are sensitive child and family data.
8. Does viewing an insight count as "sensitive data access" for the audit log (SEC-007)?
