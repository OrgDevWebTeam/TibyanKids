# Recitation annotation guide for teachers

- **Project:** Tibyan Kids
- **Author:** Ismail (AI 2: data quality and evaluation)
- **Version:** v1.2, 2026-11-15 (English version of v1.1: week 1, after review)
- **Audience of the product:** children aged 6 to 14 who are not native Arabic speakers
- **Scope:** the five surahs (Al-Fatiha, Al-Ikhlas, Al-Falaq, An-Nas, Al-Kawthar)
- **Based on:** CRS v3.0 (SEC-006, SEC-011, SEC-017, FR-QUR-003) and Architecture v3.0 (§7.3 and
  §8.6)

> 🔶 = proposed, waiting for a decision (a qualified religious reviewer or Mohammad). Not applied
> before approval.

---

## 1. Purpose

To give every annotating teacher the same rules for judging recitations, so the **golden dataset**
used to evaluate the local models and set the confidence threshold (weeks 4 and 7) is accurate.
Target: **750 recordings = 30 children × 25 ayat**, each annotated by two teachers.

---

## 2. The three judgements for a word

Each word is judged on its own, with one of these values, linked to the codes of the error taxonomy
(`docs/ai/tajweed_taxonomy_and_feedback.md`):

1. **Correct (`correct`):**
   - Letters, vowels and rules are within what is acceptable for the child's age and non-native
     tongue.
   - Nothing needs to be corrected or repeated.
2. **Needs practice (`needs_practice`):** the error is named precisely with one or more codes:
   - **Memorization error (`ERR_MEM_*`):** a word dropped, one word read as another, or an extra
     word added.
   - **Clear pronunciation error (`ERR_PRON_*`):** one letter read as another in a way that changes
     the meaning (for example س instead of ص in "الصراط"), or a change to a main grammatical vowel.
   - **Clear tajweed error (`ERR_TAJ_*`):** a lazim or muttasil madd cut short, the ghunna of a
     doubled noon dropped entirely, or qalqala left out.
   - When a word has several errors, write them all; the main error follows the priority
     memorization → pronunciation → tajweed.
3. **Cannot be judged (`poor_audio`):**
   - The recording is muffled, has a long silence, loud noise, or family voices that cover the
     child's voice.
   - This is **not the child's error**. It is also used to measure the quality gate (did it reject
     what should be rejected?).

---

## 3. Tolerance rules (suited to children's speech)

Because the children are not native Arabic speakers:

- **Accepted (not an error):**
  - Not perfectly controlling the light and heavy forms (tarqiq and tafkhim) of ر and ل.
  - Slight softness, or not fully holding a madd before a pause (aarid lil-sukun) at 2 or 4 counts.
  - The child's natural accent on hard letters (such as ط, ظ and ح), as long as the letter does not
    turn into another letter.
- **Not accepted (an error):**
  - A change of meaning (for example reading "أنعمتَ" with a damma on the ta: "أنعمتُ").
  - Dropping a letter of the word, or shortening a madd so the word becomes another word 🔶. The
    example in our ayat: **مَٰلِكِ** (Al-Fatiha 4) and **مَلِكِ** (An-Nas 2). The tolerance for
    "madd before a pause" **does not cover** this case. _The example and its category are to be
    confirmed by a qualified religious reviewer._
- **Not an error (repeats):** the child repeating a word or restarting the ayah. The judgement is
  on the child's final reading of the word 🔶 _(the policy for extra words and repeats waits for
  Mohammad's decision)._

---

## 4. Annotation schema

These fields are collected for every word, plus fields for the whole recording. Field names are
camelCase, like the result contract v3.0. The full file formats are in
`docs/ai/audio-io-and-eval-dataset.md` (sections B.5 and B.6).

**Per recording (once per recording):**

| Field            | Description                                                                                    | Example                  |
| :--------------- | :--------------------------------------------------------------------------------------------- | :----------------------- |
| `recordingId`    | Recording id (never contains the child's name)                                                 | `REC_FAT_001`            |
| `speakerId`      | Anonymous speaker id, to split the data by speaker                                             | `SPK_017`                |
| `consentId`      | Id of the parents' separate consent record (SEC-017). **No recording is annotated without it** | `CON_017`                |
| `ageBand`        | Age band                                                                                       | `6-8`, `9-11` or `12-14` |
| `source`         | `child` or `seeded_adult` (an adult recording with deliberate errors)                          | `child`                  |
| `split`          | `train`, `dev` or `test` (set after annotation; all recordings of a speaker in one split)      | `test`                   |
| `surah` / `ayah` | Where the ayah is                                                                              | `1` / `1`                |
| `audioQuality`   | `ok` or `poor_audio`                                                                           | `ok`                     |

**Per word (one row per word and per teacher):**

| Field             | Description                                                     | Example                   |
| :---------------- | :-------------------------------------------------------------- | :------------------------ |
| `recordingId`     | Recording id                                                    | `REC_FAT_001`             |
| `wordIndex`       | Word number in the ayah (from 1)                                | `3`                       |
| `annotatorId`     | Id of the annotating teacher                                    | `TCH_02`                  |
| `round`           | `1` for independent annotation, `2` for the reviewer's decision | `1`                       |
| `teacherDecision` | `correct` / `needs_practice` / `poor_audio`                     | `needs_practice`          |
| `errorCodes`      | List of error codes (empty when correct)                        | `["ERR_PRON_LETTER_SUB"]` |
| `notes`           | A short guiding note                                            | "ص read as س in الصراط"   |

---

## 5. Double annotation and resolving disagreements

> **Week 4:** one teacher labels the 17 children's recordings, so this section does not apply yet.
> The teacher fills in `labelling_sheet.csv` (`teacherDecision`, `errorCodes`, `notes`), and each
> label is final. It applies again once a second teacher joins.

- Every recording is annotated by **two teachers independently**, neither seeing the other's
  judgement.
- **Full agreement** (same judgement and same codes): accepted as is.
- **Sent to the supervising reviewer:** any recording with one of these disagreements:
  1. `correct` against `needs_practice`.
  2. Both `needs_practice`, but **different codes**.
  3. `poor_audio` against any other judgement.
- **Measuring agreement:** Cohen's kappa is computed for each error category and each age band after
  the first batch (the first 250 recordings). 🔶 The acceptable level is set by the team (initial
  proposal 0.6). If agreement is lower, the guide's instructions are reviewed before annotation
  continues.
- Who is the supervising reviewer? An open item (O-04 and OD-07).

---

## 6. Protecting the data during annotation

The recordings are children's voices, the most sensitive data we hold (Architecture §7.2):

1. **No annotation without the parents' separate, explicit consent** to use the voice for testing
   or training the models (SEC-017). Check `consentId` before opening a recording.
2. Annotation happens **only in a local tool on our machines** (SEC-011). No cloud spreadsheets, no
   external online forms, and no copies of the audio on personal devices.
3. Test recordings are copied to a **separate, restricted storage location**. Only the assigned
   annotating teachers can reach it, and every access is logged.
4. Only anonymous ids are used (`speakerId`, `recordingId`). No names or contact details in the
   annotation files.
5. How long the audio is kept, and when it is deleted, follows decision OD-04 (week 4, carried from week 3). Withdrawing
   consent stops the use and deletes the recording and its annotations (VAL-008).

---

## 7. Collecting the recordings

- **Target:** 30 children who are not native Arabic speakers × 25 ayat (750 recordings), with their
  parents' consent. The search for families starts in week 1.
- **Split:** by speaker, not by recording. The test set is **never touched** once it is fixed
  (week 4, carried from week 3: it needs the children's recordings).
- **Error balance:** most children's recordings will be correct, so the rarer categories (such as
  ghunna and qalqala) may have few examples. Therefore `seeded_adult` recordings with deliberate
  errors are added by adult volunteers, with their consent. **Their results are reported separately
  from the children's** and never mixed into the decision numbers (week 4).
- **Age coverage:** make sure all three bands (6–8, 9–11 and 12–14) are represented, since results
  are reported by age band and by error category.

---

## 8. Open items waiting for a decision

| #   | Item                                                                      | Who decides                         |
| :-- | :------------------------------------------------------------------------ | :---------------------------------- |
| 8.1 | Confirming the example and category of the shortened madd in مَٰلِكِ (§3) | Qualified religious reviewer        |
| 8.2 | The policy for repeats and restarts                                       | Mohammad                            |
| 8.3 | The acceptable level of agreement (kappa)                                 | The team (Ismail, Qussai, Mohammad) |
| 8.4 | Who the supervising reviewer and the two annotating teachers are          | O-04 / OD-07                        |
| 8.5 | How long the audio is kept                                                | OD-04 (week 4)                      |
