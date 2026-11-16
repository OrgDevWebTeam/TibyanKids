# Quran evidence integration (`QuranEvidenceEvent`)

- Owner: Ismail (AI 2). Jira: KAN-37. Consumers: AG (KAN-30, Growth Graph ingestion), API owner (emitter),
  QS (no change to the AI result).
- Version: v1.0 draft, 2026-11-15.
- Based on: `docs/ai/quran-growth-graph-mapping.md` (KAN-38, the mapping and evidence rules R1–R10), AI result
  contract v3.0 (`docs/contracts/ai-result.md`), the backend models (`Content`, `Competency`, `Progress`,
  `Assessment`, `assertChildInFamily`), CRS v2.0 (FR-QUR-003/006, FR-LIVE-004, FR-GRW-002, VAL-007/008/010/013/014)
  and Architecture v2.0 §7.1.
- Status: proposal for AG and the API owner. 🔶 = waiting for a decision.

> This document defines **when** a Quran evidence event is emitted, **what it contains**, and **how duplicates and
> corrections behave**. It does not change the AI result contract v3.0, and it does not decide how competency
> states are derived (KAN-38 section 7.4, AG).

---

## 1. Summary

- One event per **trigger**: one when an AI result is saved, one when a teacher decision is saved.
- An event says what happened to **competencies** (`effects[]`), never what the child said.
- Delivery is **at least once**. Ingestion is **idempotent**, so a repeated event changes nothing.
- A correction is a **new event** that points to the one it replaces (`supersedesEventId`). Nothing is edited.
- Events are created **server-side only**, scoped to one family and one child, with `camelCase` fields and
  MongoDB `ObjectId` references.

---

## 2. Triggers

| #   | Trigger                                            | Emits                                                 | Notes                                                                                       |
| --- | -------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| T1  | The API saves a valid AI result on a Quran attempt | one `ai_result` event                                 | Only when `quality` is `ok`, `decision` is `accepted` or `error`, and `model` is not `none` |
| T2  | A teacher decision is saved for an attempt         | one `teacher_decision` event                          | Labels `correct`, `needs_practice`, `poor_audio` (KAN-28)                                   |
| T3  | A teacher changes a decision they saved earlier 🔶 | one `teacher_decision` event with the next `revision` | Only if AG's `TeacherDecision` allows editing                                               |

**No event is emitted for:**

| Situation                                                | Why                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `quality` other than `ok`                                | Not an attempt (VAL-014, rule R1)                                                                                         |
| `decision: "uncertain"`                                  | Nothing counts until a teacher decides (rule R3)                                                                          |
| API fallback result (`model: "none"`)                    | Same (rule R2)                                                                                                            |
| Session start, session end, level-up, `Progress` changes | They are not evidence                                                                                                     |
| Parent observations                                      | Another pipeline                                                                                                          |
| Re-analysis of a saved attempt 🔶                        | Not in the prototype. `revision` stays 1 for `ai_result`. If it is added, an AI revision never supersedes a teacher event |

An `uncertain` attempt has no AI event, so the teacher decision that closes it has nothing to supersede
(`supersedesEventId: null`).

---

## 3. The event

Strict: no field outside this table is allowed at any level (`additionalProperties: false`).

### 3.1 Common fields

| Field               | Type                                     | Meaning                                                                                                       |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`     | `"1.0"`                                  | Contract version of this event                                                                                |
| `eventId`           | ObjectId                                 | Created by the emitter. Known before the event is stored, so a later event can point to it                    |
| `idempotencyKey`    | text                                     | Derived (section 4). Unique in the store                                                                      |
| `source`            | `ai_result` or `teacher_decision`        | Who produced the evidence                                                                                     |
| `revision`          | integer, 1 or more                       | Version of the same source object (section 4)                                                                 |
| `weightClass`       | `preliminary` or `professional`          | `preliminary` for `ai_result`, `professional` for `teacher_decision` (Architecture §7.1). Must match `source` |
| `domain`            | `"quran"`                                | Routing                                                                                                       |
| `familyId`          | ObjectId                                 | Tenant scope (`Family`)                                                                                       |
| `childId`           | ObjectId                                 | The child (`Child`). Must belong to `familyId`                                                                |
| `attemptId`         | ObjectId                                 | The Quran attempt (`QuranAttempt`, KAN-30)                                                                    |
| `contentId`         | ObjectId                                 | The `quran_task` `Content` the attempt belongs to                                                             |
| `surah`             | integer 1–114                            | The ayah that was recited                                                                                     |
| `ayah`              | integer, 1 or more                       |                                                                                                               |
| `level`             | `beginner`, `intermediate` or `advanced` | The recitation level used for this attempt                                                                    |
| `occurredAt`        | UTC date-time                            | When the AI result was saved, or when the teacher decision was saved                                          |
| `supersedesEventId` | ObjectId or `null`                       | The event this one replaces (section 5)                                                                       |
| `effects`           | list                                     | What this means for competencies (section 3.3)                                                                |

### 3.2 Source fields

`ai_result` events also carry `ai`:

| Field             | Type                  | Meaning                                                                                  |
| ----------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `ai.decision`     | `accepted` or `error` | Never `uncertain` (no event is emitted)                                                  |
| `ai.model`        | text                  | From the result (`quran-muaalem`, `combined`, ...). Never `none` or `mock` outside tests |
| `ai.modelVersion` | text                  | Exact revision (OPS-008)                                                                 |

`teacher_decision` events also carry `teacher`:

| Field                     | Type                                      | Meaning                                                                                            |
| ------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `teacher.decisionId`      | ObjectId                                  | The `TeacherDecision` (KAN-30)                                                                     |
| `teacher.teacherId`       | ObjectId                                  | The teacher (`User`)                                                                               |
| `teacher.label`           | `correct`, `needs_practice`, `poor_audio` | KAN-28 vocabulary                                                                                  |
| `teacher.resolutionState` | `resolved` or `needs_follow_up`           | CRS FR-LIVE-004. `correct` is `resolved`. The other two are `needs_follow_up` (KAN-38 section 7.1) |

### 3.3 One effect

| Field            | Type                                          | Meaning                                                                                  |
| ---------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `competencyId`   | ObjectId                                      | A `Competency` of `domain: "quran"`                                                      |
| `competencyCode` | text, `QUR_` + upper case                     | Copy of `Competency.code` (immutable), for reading and checks                            |
| `effect`         | `supports`, `countsAgainst`, `diagnosticOnly` | `diagnosticOnly` is for a competency that is not active (rule R6). The engine ignores it |
| `wordIndex`      | integer 1 or more, or `null`                  | The word of the ayah. `null` for `supports`                                              |
| `errorCode`      | contract error code, or `null`                | The code behind a `countsAgainst` or `diagnosticOnly`. `null` for `supports`             |
| `confidence`     | number 0–1, or `null`                         | The model's confidence for an AI finding. `null` for `supports` and for teacher events   |

### 3.4 Rules the schema enforces

| #   | Rule                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | `ai` is present only for `ai_result`. `teacher` is present only for `teacher_decision`                                                     |
| S2  | `weightClass` is `preliminary` for `ai_result` and `professional` for `teacher_decision`                                                   |
| S3  | `teacher.resolutionState` follows the label: `correct` gives `resolved`, the others give `needs_follow_up`                                 |
| S4  | `effects` has at least one item, except for `poor_audio`, where it is empty                                                                |
| S5  | `effects` has at most 32 items, with no repeated `(competencyCode, effect, wordIndex)`                                                     |
| S6  | `supports` has `wordIndex`, `errorCode` and `confidence` all `null`. `countsAgainst` and `diagnosticOnly` have `errorCode` and `wordIndex` |
| S7  | `idempotencyKey` is consistent with the event (section 4)                                                                                  |
| S8  | `supersedesEventId` differs from `eventId`                                                                                                 |
| S9  | A teacher event has `confidence: null` in every effect                                                                                     |

---

## 4. Idempotency

**Key:** `quran:{source}:{sourceId}:{revision}`

| `source`           | `sourceId`           | Example                                             |
| ------------------ | -------------------- | --------------------------------------------------- |
| `ai_result`        | `attemptId`          | `quran:ai_result:6650f0c2a1b2c3d4e5f60d01:1`        |
| `teacher_decision` | `teacher.decisionId` | `quran:teacher_decision:6650f0c2a1b2c3d4e5f60d91:1` |

Pattern: `^quran:(ai_result|teacher_decision):[a-f0-9]{24}:[1-9][0-9]*$`.

| Case                                      | Ingestion does                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| New key                                   | Stores the event                                                               |
| Same key, same content                    | Acknowledges and changes nothing (VAL-010). This is how a retry is handled     |
| Same key, different content               | Rejects with `IDEMPOTENCY_CONFLICT` and raises an alert. The first event stays |
| Next `revision` of the same source object | Stores it. Its `supersedesEventId` is the previous revision's event            |

- The store has a **unique index on `idempotencyKey`**.
- Delivery is at least once, so the emitter may send an event more than once without harm.
- Compare "same content" on the whole event except `eventId` is not needed: the emitter creates `eventId` once,
  stores it with the attempt or decision, and reuses it on every retry.

---

## 5. Supersession

- An attempt has an **event chain**. The **head** is the latest event that nothing supersedes.
- A new event for the attempt sets `supersedesEventId` to the current head, or `null` if the chain is empty.
- **At most one head per attempt.** Ingestion rejects an event whose `supersedesEventId` is not the head.
- A superseded event is **kept** for audit. Its effects stop counting. Nothing is edited or deleted.
- A teacher event supersedes the AI event of the same attempt (rule R5). `poor_audio` supersedes it with
  no effects, which removes the AI evidence.
- A teacher's later change (T3) supersedes the teacher's earlier event.

```text
attempt A:  E1 ai_result (head)
            E2 teacher_decision, supersedes E1 (head). E1 no longer counts
            E3 teacher_decision revision 2, supersedes E2 (head)  [T3]
```

---

## 6. Computing the effects

The mapping tables are in KAN-38 (sections 5 and 6). This section turns them into steps, so the emitter and
the tests share one definition. The function is pure: the same input always gives the same effects.

### 6.1 Inputs

- The saved AI result (`decision`, `quality`, `model`, `findings`), or the teacher decision.
- The attempt: `attemptId`, `familyId`, `childId`, `contentId`, `surah`, `ayah`, `level`.
- The competencies tagged on the `quran_task` (`id`, `code`, `active`).
- The seed catalog of KAN-38 section 4.

### 6.2 `ai_result` event

1. If `quality` is not `ok`, or `decision` is `uncertain`, or `model` is `none`: **no event**.
2. For each finding, take its competency from the mapping table:
   - no competency (`ERR_TAJ_UNMAPPED`, `ERR_TECH_MODELS_DISAGREE`): skip. These codes always make the result
     `uncertain`, so this cannot happen after step 1.
   - competency active: `countsAgainst`, with `wordIndex`, `errorCode`, `confidence`.
   - competency not active (🔶 codes): `diagnosticOnly`, with the same fields.
3. If `decision` is `accepted`, add `supports` for the **support set**:
   `QUR_MEM_AYAH`, plus the active competencies tagged on the task that the AI can detect today, minus every
   competency that has a `countsAgainst` in step 2.
4. If `decision` is `error`, add **no** `supports`. The child was stopped, so the attempt does not show the
   skills that were not flagged.
5. If a competency of the catalog is missing, fail with `COMPETENCY_NOT_SEEDED`. Never drop an effect silently.

### 6.3 `teacher_decision` event

| Label            | Effects                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `correct`        | `supports` for the support set (as in step 3). No `countsAgainst`: the teacher overrides the model                                                        |
| `needs_practice` | `countsAgainst` (or `diagnosticOnly` for an inactive competency) for each error the teacher confirmed, with its `wordIndex` and `errorCode`. Nothing else |
| `poor_audio`     | none (`effects` is empty). The event removes the AI evidence                                                                                              |

Requirement for AG (`TeacherDecision`): `needs_practice` carries **at least one confirmed finding**
(`wordIndex` and an error code from the contract). Free-text notes are **not** copied into the event.

---

## 7. Examples

All ids are made up. They are 24-character hexadecimal values, the shape of an `ObjectId`.

Common context: family `…0a01`, child `…0b01`, task `…0c01` (tagged with `QUR_MEM_AYAH` and `QUR_TAJ_MADD`),
`QUR_TAJ_GHUNNA` not active. Competency ids: `QUR_MEM_AYAH` `…0e01`, `QUR_TAJ_MADD` `…0e04`, `QUR_TAJ_GHUNNA` `…0e06`.

### 7.1 AI accepted, then the teacher says `poor_audio` (attempt 1)

#### Example 1: `ai_result`, accepted

```json
{
  "schemaVersion": "1.0",
  "eventId": "6650f0c2a1b2c3d4e5f60f01",
  "idempotencyKey": "quran:ai_result:6650f0c2a1b2c3d4e5f60d01:1",
  "source": "ai_result",
  "revision": 1,
  "weightClass": "preliminary",
  "domain": "quran",
  "familyId": "6650f0c2a1b2c3d4e5f60a01",
  "childId": "6650f0c2a1b2c3d4e5f60b01",
  "attemptId": "6650f0c2a1b2c3d4e5f60d01",
  "contentId": "6650f0c2a1b2c3d4e5f60c01",
  "surah": 112,
  "ayah": 1,
  "level": "beginner",
  "occurredAt": "2026-11-20T09:14:05Z",
  "supersedesEventId": null,
  "ai": { "decision": "accepted", "model": "combined", "modelVersion": "mdd-0.1" },
  "effects": [
    {
      "competencyId": "6650f0c2a1b2c3d4e5f60e01",
      "competencyCode": "QUR_MEM_AYAH",
      "effect": "supports",
      "wordIndex": null,
      "errorCode": null,
      "confidence": null
    },
    {
      "competencyId": "6650f0c2a1b2c3d4e5f60e04",
      "competencyCode": "QUR_TAJ_MADD",
      "effect": "supports",
      "wordIndex": null,
      "errorCode": null,
      "confidence": null
    }
  ]
}
```

#### Example 2: `teacher_decision`, `poor_audio` (removes Example 1)

```json
{
  "schemaVersion": "1.0",
  "eventId": "6650f0c2a1b2c3d4e5f60f02",
  "idempotencyKey": "quran:teacher_decision:6650f0c2a1b2c3d4e5f60d91:1",
  "source": "teacher_decision",
  "revision": 1,
  "weightClass": "professional",
  "domain": "quran",
  "familyId": "6650f0c2a1b2c3d4e5f60a01",
  "childId": "6650f0c2a1b2c3d4e5f60b01",
  "attemptId": "6650f0c2a1b2c3d4e5f60d01",
  "contentId": "6650f0c2a1b2c3d4e5f60c01",
  "surah": 112,
  "ayah": 1,
  "level": "beginner",
  "occurredAt": "2026-11-20T18:30:00Z",
  "supersedesEventId": "6650f0c2a1b2c3d4e5f60f01",
  "teacher": {
    "decisionId": "6650f0c2a1b2c3d4e5f60d91",
    "teacherId": "6650f0c2a1b2c3d4e5f60a99",
    "label": "poor_audio",
    "resolutionState": "needs_follow_up"
  },
  "effects": []
}
```

### 7.2 AI `error`, then the teacher says `correct` (attempt 2)

#### Example 3: `ai_result`, error (a word replaced)

```json
{
  "schemaVersion": "1.0",
  "eventId": "6650f0c2a1b2c3d4e5f60f03",
  "idempotencyKey": "quran:ai_result:6650f0c2a1b2c3d4e5f60d02:1",
  "source": "ai_result",
  "revision": 1,
  "weightClass": "preliminary",
  "domain": "quran",
  "familyId": "6650f0c2a1b2c3d4e5f60a01",
  "childId": "6650f0c2a1b2c3d4e5f60b01",
  "attemptId": "6650f0c2a1b2c3d4e5f60d02",
  "contentId": "6650f0c2a1b2c3d4e5f60c01",
  "surah": 112,
  "ayah": 2,
  "level": "beginner",
  "occurredAt": "2026-11-20T09:16:40Z",
  "supersedesEventId": null,
  "ai": { "decision": "error", "model": "combined", "modelVersion": "mdd-0.1" },
  "effects": [
    {
      "competencyId": "6650f0c2a1b2c3d4e5f60e01",
      "competencyCode": "QUR_MEM_AYAH",
      "effect": "countsAgainst",
      "wordIndex": 1,
      "errorCode": "ERR_MEM_SUBSTITUTION",
      "confidence": 0.92
    }
  ]
}
```

#### Example 4: `teacher_decision`, `correct` (overrides Example 3)

```json
{
  "schemaVersion": "1.0",
  "eventId": "6650f0c2a1b2c3d4e5f60f04",
  "idempotencyKey": "quran:teacher_decision:6650f0c2a1b2c3d4e5f60d92:1",
  "source": "teacher_decision",
  "revision": 1,
  "weightClass": "professional",
  "domain": "quran",
  "familyId": "6650f0c2a1b2c3d4e5f60a01",
  "childId": "6650f0c2a1b2c3d4e5f60b01",
  "attemptId": "6650f0c2a1b2c3d4e5f60d02",
  "contentId": "6650f0c2a1b2c3d4e5f60c01",
  "surah": 112,
  "ayah": 2,
  "level": "beginner",
  "occurredAt": "2026-11-20T18:31:10Z",
  "supersedesEventId": "6650f0c2a1b2c3d4e5f60f03",
  "teacher": {
    "decisionId": "6650f0c2a1b2c3d4e5f60d92",
    "teacherId": "6650f0c2a1b2c3d4e5f60a99",
    "label": "correct",
    "resolutionState": "resolved"
  },
  "effects": [
    {
      "competencyId": "6650f0c2a1b2c3d4e5f60e01",
      "competencyCode": "QUR_MEM_AYAH",
      "effect": "supports",
      "wordIndex": null,
      "errorCode": null,
      "confidence": null
    },
    {
      "competencyId": "6650f0c2a1b2c3d4e5f60e04",
      "competencyCode": "QUR_TAJ_MADD",
      "effect": "supports",
      "wordIndex": null,
      "errorCode": null,
      "confidence": null
    }
  ]
}
```

### 7.3 AI accepted with a madd note, then the teacher says `needs_practice` (attempt 3)

#### Example 5: `ai_result`, accepted with a confident note that does not stop a beginner

```json
{
  "schemaVersion": "1.0",
  "eventId": "6650f0c2a1b2c3d4e5f60f05",
  "idempotencyKey": "quran:ai_result:6650f0c2a1b2c3d4e5f60d03:1",
  "source": "ai_result",
  "revision": 1,
  "weightClass": "preliminary",
  "domain": "quran",
  "familyId": "6650f0c2a1b2c3d4e5f60a01",
  "childId": "6650f0c2a1b2c3d4e5f60b01",
  "attemptId": "6650f0c2a1b2c3d4e5f60d03",
  "contentId": "6650f0c2a1b2c3d4e5f60c01",
  "surah": 1,
  "ayah": 4,
  "level": "beginner",
  "occurredAt": "2026-11-21T09:20:12Z",
  "supersedesEventId": null,
  "ai": { "decision": "accepted", "model": "combined", "modelVersion": "mdd-0.1" },
  "effects": [
    {
      "competencyId": "6650f0c2a1b2c3d4e5f60e04",
      "competencyCode": "QUR_TAJ_MADD",
      "effect": "countsAgainst",
      "wordIndex": 1,
      "errorCode": "ERR_TAJ_MADD_SHORT",
      "confidence": 0.86
    },
    {
      "competencyId": "6650f0c2a1b2c3d4e5f60e01",
      "competencyCode": "QUR_MEM_AYAH",
      "effect": "supports",
      "wordIndex": null,
      "errorCode": null,
      "confidence": null
    }
  ]
}
```

#### Example 6: `teacher_decision`, `needs_practice` (confirms the madd error)

```json
{
  "schemaVersion": "1.0",
  "eventId": "6650f0c2a1b2c3d4e5f60f06",
  "idempotencyKey": "quran:teacher_decision:6650f0c2a1b2c3d4e5f60d93:1",
  "source": "teacher_decision",
  "revision": 1,
  "weightClass": "professional",
  "domain": "quran",
  "familyId": "6650f0c2a1b2c3d4e5f60a01",
  "childId": "6650f0c2a1b2c3d4e5f60b01",
  "attemptId": "6650f0c2a1b2c3d4e5f60d03",
  "contentId": "6650f0c2a1b2c3d4e5f60c01",
  "surah": 1,
  "ayah": 4,
  "level": "beginner",
  "occurredAt": "2026-11-21T18:02:44Z",
  "supersedesEventId": "6650f0c2a1b2c3d4e5f60f05",
  "teacher": {
    "decisionId": "6650f0c2a1b2c3d4e5f60d93",
    "teacherId": "6650f0c2a1b2c3d4e5f60a99",
    "label": "needs_practice",
    "resolutionState": "needs_follow_up"
  },
  "effects": [
    {
      "competencyId": "6650f0c2a1b2c3d4e5f60e04",
      "competencyCode": "QUR_TAJ_MADD",
      "effect": "countsAgainst",
      "wordIndex": 1,
      "errorCode": "ERR_TAJ_MADD_SHORT",
      "confidence": null
    }
  ]
}
```

### 7.4 A 🔶 code is diagnostic only (attempt 4)

#### Example 7: `ai_result`, accepted, with a ghunna finding (code not approved yet)

```json
{
  "schemaVersion": "1.0",
  "eventId": "6650f0c2a1b2c3d4e5f60f07",
  "idempotencyKey": "quran:ai_result:6650f0c2a1b2c3d4e5f60d04:1",
  "source": "ai_result",
  "revision": 1,
  "weightClass": "preliminary",
  "domain": "quran",
  "familyId": "6650f0c2a1b2c3d4e5f60a01",
  "childId": "6650f0c2a1b2c3d4e5f60b01",
  "attemptId": "6650f0c2a1b2c3d4e5f60d04",
  "contentId": "6650f0c2a1b2c3d4e5f60c01",
  "surah": 114,
  "ayah": 4,
  "level": "intermediate",
  "occurredAt": "2026-11-21T09:25:30Z",
  "supersedesEventId": null,
  "ai": { "decision": "accepted", "model": "combined", "modelVersion": "mdd-0.1" },
  "effects": [
    {
      "competencyId": "6650f0c2a1b2c3d4e5f60e06",
      "competencyCode": "QUR_TAJ_GHUNNA",
      "effect": "diagnosticOnly",
      "wordIndex": 4,
      "errorCode": "ERR_TAJ_GHONNA_OMIT",
      "confidence": 0.9
    },
    {
      "competencyId": "6650f0c2a1b2c3d4e5f60e01",
      "competencyCode": "QUR_MEM_AYAH",
      "effect": "supports",
      "wordIndex": null,
      "errorCode": null,
      "confidence": null
    },
    {
      "competencyId": "6650f0c2a1b2c3d4e5f60e04",
      "competencyCode": "QUR_TAJ_MADD",
      "effect": "supports",
      "wordIndex": null,
      "errorCode": null,
      "confidence": null
    }
  ]
}
```

---

## 8. Ingestion checks and errors

The ingestion (AG) validates every event before it is stored. It never trusts the payload alone.

| Code                         | When                                                                                            | Retry? |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| `SCHEMA_INVALID`             | The event breaks section 3 (any field, enum, strictness or rule S1–S9)                          | No     |
| `TENANT_MISMATCH`            | The child does not belong to `familyId`, or is not active (same check as `assertChildInFamily`) | No     |
| `UNKNOWN_COMPETENCY`         | A `competencyId` does not exist, or its code differs from `competencyCode`                      | No     |
| `COMPETENCY_DOMAIN_MISMATCH` | A competency is not in `domain: "quran"`                                                        | No     |
| `UNKNOWN_SUPERSEDED_EVENT`   | `supersedesEventId` is not stored yet (the earlier event may still be on its way)               | Yes    |
| `SUPERSEDE_NOT_HEAD`         | `supersedesEventId` is not the head of the attempt's chain                                      | No     |
| `IDEMPOTENCY_CONFLICT`       | Same key, different content                                                                     | No     |

A rejected event is kept in a dead-letter list for the API owner, without its body in the logs (section 9).

**Consumer rules (what AG's engine must apply):**

1. Ignore superseded events.
2. Ignore `diagnosticOnly` effects.
3. Preliminary events never move a competency to or from `mastered` (rule R4).
4. A `supports` or `countsAgainst` counts toward the thresholds in KAN-38 section 7.3.
5. Competency state is derived from the non-superseded events. It is not stored in the event.

---

## 9. Privacy and scope

**Never in the event or its logs:**

| Excluded                                                                      | Why                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------- |
| Audio, an audio URL or `audioRef`, any file name or object key of a recording | NFR-OBS-001, SEC-011                         |
| Whisper transcripts, phoneme text, `expected` or `predicted` strings          | NFR-OBS-001                                  |
| Free text of any kind: teacher notes, parent notes, comments                  | They can name a child                        |
| Child, parent or teacher names, contact details, device or network data       | SEC-011                                      |
| Raw model codes, model scores other than the finding `confidence`, timings    | Not needed. They stay in the AI service logs |
| `messageKey` and the text shown to the child                                  | Presentation, not evidence                   |

- The schema has **no free-text field** and `additionalProperties: false` at every level, so the exclusion
  is enforced by structure.
- **Logs** may contain `eventId`, `source`, the error code and counts. They must not contain `familyId`,
  `childId` or the effects.
- **Tenant scope:** every event has `familyId` and `childId`. Reads of evidence always filter by both.
- **Server-side only:** events are created by trusted API code. No browser or AI service can post an event.
- **Withdrawn consent (VAL-008):** deleting a child's data must delete their events. The store needs a way to
  delete by `childId`.

---

## 10. What this needs from others

| #   | For         | Requirement                                                                                                                               |
| --- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | AG (KAN-30) | Store events with a unique index on `idempotencyKey`, keep one head per attempt, and apply section 8                                      |
| 2   | AG (KAN-30) | `TeacherDecision` carries the label, and for `needs_practice` at least one confirmed finding (`wordIndex` and code); notes are not copied |
| 3   | AG (KAN-30) | Seed the eight competencies of KAN-38 section 4 before the emitter runs                                                                   |
| 4   | API owner   | Emit T1 after the AI result passes `aiResultSchema` and is saved. Emit T2 when a decision is saved                                        |
| 5   | API owner   | Create `eventId` once and store it with the attempt or decision, so a retry sends the same event                                          |
| 6   | API owner   | `attemptId` type: `ai-result.md` says "a UUID" while its examples are 24-character hexadecimal. This contract assumes `ObjectId`          |
| 7   | QS          | No change to the AI result. The `targetedTajweedCodes` request field of KAN-38 section 9.3 is separate                                    |

---

## 11. Next steps (Phase 4, not in this document)

A JSON Schema, a zod schema and `vitest` tests for `QuranEvidenceEvent`, including the effect computation
of section 6 as a pure function.

---

## 12. Open items

| #   | Item                                                                                   | Who decides   |
| --- | -------------------------------------------------------------------------------------- | ------------- |
| 1   | Whether teachers can edit a saved decision (T3, and `revision` above 1)                | AG            |
| 2   | `attemptId` is an `ObjectId` or a UUID (item 6 above)                                  | API owner     |
| 3   | How events travel from the API to the ingestion (in process, outbox collection, queue) | AG, API owner |
| 4   | Whether re-analysis of a saved attempt is ever added (T4 is out for the prototype)     | Mohammad      |
| 5   | The cap of 32 effects per event                                                        | AG            |
| 6   | Where rejected events are kept and who reads them                                      | API owner     |
