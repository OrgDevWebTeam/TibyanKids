# Quran domain in the Growth Graph

- Owner: Ismail (AI 2). Jira: KAN-38. Reviewed with: Qussai (AI results), Ahmad (Growth Graph),
  the qualified religious reviewer (names and rules, O-04).
- Version: v0.1 (proposal), 2026-11-15.
- Based on: CRS v3.0 (§5.2 no mastery on the model's word alone, §5.4 level rules, §11.1 "not
  assessed" vs "needs support", FR-GRW-001), `docs/contracts/ai-result.md`,
  `docs/ai/tajweed_taxonomy_and_feedback.md`.
- Data: `packages/contracts/data/quran_competencies.json` (the list below, ready to load).
- Next: KAN-37 turns these rules into evidence events, with Ahmad's Growth Graph model.

## 1. The competencies

Eleven competencies in the `quran` domain: one per prototype surah, and one per skill the
recitation check can give evidence for. Each skill matches a category or error code of the
contract, so every AI finding lands on exactly one competency. The Arabic names are in
`quran_competencies.json`.

| Code              | English                                      | Evidence from the recitation check                       |
| ----------------- | -------------------------------------------- | -------------------------------------------------------- |
| `QURAN-SURAH-001` | Reciting Surah Al-Fatiha                     | Every ayah of the surah (§3)                             |
| `QURAN-SURAH-108` | Reciting Surah Al-Kawthar                    | Same                                                     |
| `QURAN-SURAH-112` | Reciting Surah Al-Ikhlas                     | Same                                                     |
| `QURAN-SURAH-113` | Reciting Surah Al-Falaq                      | Same                                                     |
| `QURAN-SURAH-114` | Reciting Surah An-Nas                        | Same                                                     |
| `QURAN-WORDS`     | Reading every word of the ayah, in order     | `memorization`: `ERR_MEM_*`                              |
| `QURAN-LETTERS`   | Pronouncing each letter correctly            | `ERR_PRON_LETTER_SUB`                                    |
| `QURAN-HARAKAT`   | Reading the short vowels (harakat) correctly | `ERR_PRON_HARAKA`                                        |
| `QURAN-MADD`      | Madd (lengthening)                           | `ERR_TAJ_MADD_SHORT` (and 🔶 `ERR_PRON_MADD_ASLI_SHORT`) |
| `QURAN-GHUNNA`    | Ghunna (nasal sound)                         | 🔶 `ERR_TAJ_GHONNA_OMIT` — not produced yet (§5)         |
| `QURAN-QALQALA`   | Qalqala (echo)                               | `ERR_TAJ_QALQALA_OMIT`                                   |

The `memorization` codes check whether each word was read, in order, while the ayah is on the
screen. They do not test reciting from memory, so the competency is named for what is checked.

## 2. Where each skill appears in the prototype surahs

Counted from the reference text: madd and qalqala from the tajweed rules `quran-transcript` attaches
to each letter, ghunna as the words with a doubled noon or meem (نّ / مّ), since the library does not
tag ghunna yet (§5).

| Surah            | Ayat | Words | Madd places | Qalqala places | Ghunna words (نّ / مّ)                   |
| ---------------- | ---- | ----- | ----------- | -------------- | ---------------------------------------- |
| Al-Fatiha (1)    | 7    | 29    | 20          | 0              | 0                                        |
| Al-Kawthar (108) | 3    | 10    | 3           | 1              | 2 (إِنَّآ، إِنَّ)                        |
| Al-Ikhlas (112)  | 4    | 15    | 4           | 5              | 0                                        |
| Al-Falaq (113)   | 5    | 23    | 7           | 5              | 1 (ٱلنَّفَّٰثَٰتِ)                       |
| An-Nas (114)     | 6    | 20    | 12          | 0              | 7 (ٱلنَّاسِ ×5، ٱلْخَنَّاسِ، ٱلْجِنَّةِ) |

So Al-Fatiha and An-Nas carry most of the madd practice, Al-Ikhlas and Al-Falaq the qalqala, and
An-Nas the ghunna. This is the starting point for the targeted rules per lesson (taxonomy §2.1),
which the religious reviewer approves.

## 3. Which recitation results count as evidence

The recitation check gives one result per recorded ayah (`docs/contracts/ai-result.md`). The table
says what each result means for the competencies. "AI evidence" is preliminary (AP-04); "teacher
evidence" is a teacher's decision on the attempt.

| Result                                          | Surah competency                      | Skill competencies                                                                                                                             |
| ----------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality` is not `ok` (rejected recording)      | Nothing                               | Nothing. Not an attempt (VAL-014)                                                                                                              |
| `model: "none"` (AI down or slow, API fallback) | Nothing until a teacher decides       | Nothing until a teacher decides                                                                                                                |
| `decision: "uncertain"`                         | Nothing until a teacher decides       | Nothing until a teacher decides. The teacher's decision is then teacher evidence for the competencies of the findings it confirms or rejects   |
| `decision: "error"`                             | AI evidence: this ayah needs practice | AI evidence "needs practice" for the competency of each **stopping** finding                                                                   |
| `decision: "accepted"`                          | AI evidence: this ayah was read       | AI evidence "read correctly" only for the skills the child's level checks (below). Non-stopping findings are kept as AI notes, not as evidence |

What each level checks (CRS §5.4), and so which skills an `accepted` ayah supports:

| Level          | Checked, so an `accepted` ayah is evidence for                                      |
| -------------- | ----------------------------------------------------------------------------------- |
| `beginner`     | `QURAN-WORDS`                                                                       |
| `intermediate` | `QURAN-WORDS`, `QURAN-LETTERS`, `QURAN-HARAKAT`                                     |
| `advanced`     | The above, plus the tajweed skills of the rules targeted in that ayah's lesson (§2) |

A tajweed skill is never "read correctly" just because no tajweed finding was reported below the
`advanced` level: it was not checked.

## 4. Rules for the Growth Map

1. **AI alone never marks a competency as achieved** (CRS §5.2, Architecture §8.7). AI evidence can
   show "practising" or "needs practice"; "achieved" needs teacher evidence.
2. **A surah competency is achieved only with a teacher's confirmation** (Quran level-ups need
   teacher confirmation, CRS §5.4).
3. **"Not assessed" is not "needs support"** (CRS §11.1). A skill no session has checked yet, such
   as `QURAN-GHUNNA` today, shows as not assessed.
4. 🔶 Codes that are not approved yet (`ERR_MEM_INSERTION`, `ERR_PRON_MADD_ASLI_SHORT`,
   `ERR_TAJ_GHONNA_OMIT`) give no evidence until they are approved, just as they never stop a child.
5. `ERR_TAJ_UNMAPPED` and `ERR_TECH_MODELS_DISAGREE` always make the ayah `uncertain`, so they only
   become evidence through the teacher.

## 5. Open items

| #   | Item                                                                                                                                                                                                                                                                                                                     | Who                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| 1   | Approve the competency names (Arabic and English) and the per-surah rule counts                                                                                                                                                                                                                                          | Ismail + religious reviewer (O-04) |
| 2   | `quran-transcript` 0.6.4 does not tag ghunna (its `MoshaddadOrModghamNoonRule` is never attached; the library lists ghunna as to do). So `ERR_TAJ_GHONNA_OMIT` cannot be produced: a ghunna error comes out as `ERR_TAJ_UNMAPPED` and goes to the teacher. Until that changes, `QURAN-GHUNNA` gets teacher evidence only | Qussai (watch library releases)    |
| 3   | Evidence events: the fields, where they are stored, and how a teacher decision is linked to its attempt                                                                                                                                                                                                                  | KAN-37 (Ismail + Ahmad)            |
| 4   | Load the list in each environment as a content admin (below)                                                                                                                                                                                                                                                             | Content admin                      |

## 6. Loading the list

Each entry of `quran_competencies.json` is a valid body for `POST /api/v1/curriculum/competencies`
(`tests/data/quranCompetencies.test.js` in the API checks this with the API's own schema). As a
content admin or platform admin:

```bash
node -e 'for (const c of require("./packages/contracts/data/quran_competencies.json")) console.log(JSON.stringify(c))' |
while read -r body; do
  curl -sS -X POST "$API_URL/api/v1/curriculum/competencies" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$body"
  echo
done
```

Running it again is safe: a code that already exists answers `409` and is left as it is.
