# Tajweed error taxonomy and safe feedback messages

- **Project:** Tibyan Kids
- **Owner:** Ismail (AI 2: data, tajweed and evaluation)
- **Version:** v1.3, 2026-11-15 (English version of v1.2: week 1, after the review of PR #12 and the
  quran-muaalem mapping)
- **Scope:** the five prototype surahs (Al-Fatiha, Al-Ikhlas, Al-Falaq, An-Nas, Al-Kawthar)
- **Based on:** CRS v3.0 (§5.3 and §5.4, FR-QUR-003..008, VAL-006, VAL-013, VAL-014) and
  Architecture v3.0 (§8.3 and §8.4)
- **Result contract:** v3.0 (`docs/contracts/ai-result.md`): camelCase field names, words numbered
  from 1. Diagnostic detail (raw model codes, phonemes, mushaf settings) is kept in the AI service
  logs and the evaluation output, not in the contract.

> 🔶 = proposed, waiting for a decision (Mohammad or a qualified religious reviewer). Not switched on
> in the code until approved. Everything else follows the CRS and the Architecture.

---

## 1. Error categories and codes

These codes appear in `findings[].code`, with their category in `findings[].category` (contract
schema `recitation_result.schema.json`).

| Category        | Code                          | Error                                                                         | Expected source                                                                                                            |
| :-------------- | :---------------------------- | :---------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `memorization`  | `ERR_MEM_OMISSION`            | A whole word skipped                                                          | whisper-quran's word comparison with the reference text, and muaalem's sound alignment                                     |
|                 | `ERR_MEM_SUBSTITUTION`        | One word read as another                                                      | whisper-quran's word comparison                                                                                            |
|                 | `ERR_MEM_INSERTION` 🔶        | An extra word that is not in the ayah                                         | whisper-quran's word comparison. **Repeats and restarts are ignored** and do not stop the child until decision 5.5 is made |
| `pronunciation` | `ERR_PRON_LETTER_SUB`         | One letter read as another (for example ص read as س)                          | Sound differences in muaalem                                                                                               |
|                 | `ERR_PRON_HARAKA`             | A clear vowel (haraka) error                                                  | Vowel sounds in muaalem                                                                                                    |
|                 | `ERR_PRON_MADD_ASLI_SHORT` 🔶 | A shortened madd that changes the word itself (in our ayat: مَٰلِكِ → مَلِكِ) | muaalem sounds plus the madd length settings. **Waiting for the religious reviewer's confirmation**                        |
| `tajweed`       | `ERR_TAJ_MADD_SHORT`          | A madd held too short (muttasil, munfasil, lazim)                             | muaalem sounds plus the expected madd lengths. Measurement accuracy is tested in week 4                                    |
|                 | `ERR_TAJ_GHONNA_OMIT` 🔶      | Ghunna left out                                                               | The ghunna attribute, or a repeated noon or meem, in muaalem's sounds. **Not produced yet**: see rule 5 in §1.4            |
|                 | `ERR_TAJ_QALQALA_OMIT`        | Qalqala left out                                                              | The Qalqalah rule in muaalem                                                                                               |

### 1.1 Priority when one word has several errors

Each word gets one main error, by priority: **memorization → pronunciation → tajweed**. The other
errors and the raw model codes are kept in the AI service logs for diagnosis.

### 1.2 Quality-gate rejections (not errors)

Silence and noise are **not errors** and never appear in `findings`. The quality gate (ffmpeg and
Silero VAD) rejects the recording before analysis, so it does not count as an attempt (FR-QUR-003,
VAL-014).

In contract v3.0: `quality` is not `ok`, `decision` is `uncertain`, and `findings` is empty.

| Case                                                               | `quality` in contract v3.0 |
| :----------------------------------------------------------------- | :------------------------- |
| Silence, no speech (formerly `ERR_TECH_NO_SPEECH`)                 | `silent`                   |
| Loud noise (formerly `ERR_TECH_HIGH_NOISE`) or clipped audio       | `too_noisy`                |
| Recording too short                                                | `too_short`                |
| Reading longer than 30 s (without the silence before and after it) | `too_long`                 |

The child hears `FEEDBACK_AUDIO_UNCLEAR`, or `FEEDBACK_AUDIO_TOO_LONG` for a long recording.

### 1.3 Decision values (`decision`)

Only `accepted`, `error` or `uncertain` (Architecture §8.2). The value `needs_practice` is not used
in the contract.

### 1.4 Mapping quran-muaalem output to our codes

Interface used: the Python reference interface (`Aya` → `quran_phonetizer` → `Muaalem`) inside our
AI service, not the `/correct-recitation` endpoint. Reason: `/correct-recitation` takes only the
audio and searches the whole Quran for it, while we know the expected ayah; its errors also have no
confidence. The mapping is implemented in `error_code()` in `services/ai/app/adapters/muaalem.py`.

| What muaalem returns                                                                                                 | Our code               | Notes                                                                                                                                                                                       |
| :------------------------------------------------------------------------------------------------------------------- | :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `error_type = normal`                                                                                                | `ERR_PRON_LETTER_SUB`  |                                                                                                                                                                                             |
| `error_type = tashkeel`                                                                                              | `ERR_PRON_HARAKA`      |                                                                                                                                                                                             |
| `error_type = tajweed` + the Qalqalah rule                                                                           | `ERR_TAJ_QALQALA_OMIT` |                                                                                                                                                                                             |
| `error_type = tajweed` + one of the madd rules (natural, munfasil, muttasil, muttasil at a stop, lazim, aarid, leen) | `ERR_TAJ_MADD_SHORT`   | Natural madd becomes `ERR_PRON_MADD_ASLI_SHORT` 🔶 if decision 5.2 is approved. Aarid madd: accepted at two counts or more (the tolerance in the correction guide, applied after analysis). |
| `error_type = tajweed` with no known rule, or a rule not listed above                                                | `ERR_TAJ_UNMAPPED`     | `decision = uncertain` and the ayah goes to the teacher with `FEEDBACK_TEACHER_REVIEW`. We never guess the rule.                                                                            |
| Nothing (muaalem does not work on words)                                                                             | `ERR_MEM_*`            | These come from whisper-quran's word comparison                                                                                                                                             |

Mapping rules:

1. **One word, one finding:** the phoneme errors of a word are merged by priority memorization →
   pronunciation → tajweed (§1.1). Phoneme detail stays in the AI service logs and the evaluation
   output.
2. **Confidence** comes from the phoneme and attribute probabilities of the Python interface. A
   finding without a confidence is marked `uncertain` and no decision is built on it (VAL-006).
3. **Mushaf settings:** the expected madd lengths are fixed by decision 5.3, set in the AI service
   settings, and logged with every result. The package defaults (4 for munfasil, muttasil and aarid)
   are not our decision.
4. **Madd accuracy:** madd measurement is tested on our data in week 4 before
   `ERR_TAJ_MADD_SHORT` stops any child. Until then it is a reminder only.
5. **Ghunna:** `ERR_TAJ_GHONNA_OMIT` is not switched on before it is tested (it may appear as a
   phoneme substitution rather than a rule). Also, `quran-transcript` 0.6.4 does not tag ghunna at
   all, so with this version the code is never produced: a ghunna error comes out as
   `ERR_TAJ_UNMAPPED` and goes to the teacher (`docs/ai/quran-growth-mapping.md`, open item 2).

---

## 2. Level rules (what stops the child?)

Follows CRS §5.4. **Stopping** means the word is highlighted and replayed from the reference, and
the child does not move on until the reading is correct (FR-QUR-005).

- **Beginner:**
  - **Stops on:** `ERR_MEM_OMISSION` and `ERR_MEM_SUBSTITUTION`.
  - **Reminder only, no stop:** pronunciation and tajweed errors.
- **Intermediate:**
  - **Stops on:** memorization errors and pronunciation errors (`ERR_PRON_*`).
  - **Reminder only, no stop:** tajweed errors.
- **Advanced:**
  - **Stops on:** memorization and pronunciation errors, and only the tajweed rules **targeted in
    the lesson** (`ERR_TAJ_*`).

Notes:

- `ERR_MEM_INSERTION` 🔶 does not stop the child at any level before decision 5.5.
- `ERR_PRON_MADD_ASLI_SHORT` 🔶 is treated as pronunciation (stops from intermediate) if approved.
- Errors that do not stop the child get a gentle reminder and are kept as preliminary evidence only.

### 2.1 Targeted rules per lesson (needed for the advanced level)

The advanced level needs to know which rules are targeted in each word. In week 4 (carried from
week 3), together with the level rule tables, a file of this shape is created and approved by a qualified religious
reviewer (O-04):

```json
{
  "surah": 1,
  "ayah": 1,
  "targets": [{ "wordIndex": 1, "codes": ["ERR_TAJ_..."], "lessonId": "TBD" }]
}
```

(Shape only. The team and the reviewer fill in the values. Where each rule appears in the five
surahs is counted in `docs/ai/quran-growth-mapping.md` §2.)

---

## 3. Safe and encouraging feedback messages (`messageKey`)

**The only source of the texts is `packages/contracts/schemas/safe_messages_v1_1.json`**, which
holds the Arabic and English text of each message. The table below lists the keys with their
English text for reading; check the file for the Arabic. The contract field is `messageKey`.

Writing rules:

1. **Gender-neutral:** the agent's lines are pre-recorded by a human voice (C-02), and Arabic
   second-person forms show gender when spoken, so the messages use "we".
2. No claim of mastery or closeness ("mastered", "very close"): the model's result is preliminary
   only (AP-04).
3. Short sentences, one idea each, no terms except the name of the rule the child is learning.
4. No promise of a time or a class for the review: a teacher may not be available
   (Architecture §8.4).
5. Raw model text is never shown to a child, and neither are Whisper transcripts.

| Key                               | English text                                                                                  | Used for                                                                |
| :-------------------------------- | :-------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| `FEEDBACK_CORRECT_EXCELLENT`      | Masha'Allah! Beautiful recitation. Let's keep going.                                          | `decision = accepted`                                                   |
| `FEEDBACK_LISTEN_AND_REPEAT_WORD` | Good try! Let's listen to the colored word together, then say it again.                       | `ERR_PRON_LETTER_SUB`                                                   |
| `FEEDBACK_CHECK_HARAKA`           | Good try! Let's listen to the vowel sound on the colored letter once more.                    | `ERR_PRON_HARAKA`                                                       |
| `FEEDBACK_WORD_MISSED`            | Let's listen to the colored word, we skipped it. Then we'll read the verse again.             | `ERR_MEM_OMISSION`                                                      |
| `FEEDBACK_WORD_DIFFERENT`         | Let's listen to the verse once more exactly as it is, then read it together.                  | `ERR_MEM_SUBSTITUTION`, `ERR_MEM_INSERTION`                             |
| `FEEDBACK_MADD_REMINDER`          | Let's stretch the sound of the colored letter a little. Let's hear it together.               | `ERR_TAJ_MADD_SHORT`                                                    |
| `FEEDBACK_GHUNNA_REMINDER`        | Let's add the soft nasal 'ghunna' sound on the colored letter.                                | `ERR_TAJ_GHONNA_OMIT`                                                   |
| `FEEDBACK_QALQALA_REMINDER`       | Let's give the colored letter its little bounce, called qalqala.                              | `ERR_TAJ_QALQALA_OMIT`                                                  |
| `FEEDBACK_AUDIO_UNCLEAR`          | We couldn't hear a clear voice. Let's move closer to the microphone and record again, calmly. | `quality` is not `ok` (not counted as an attempt)                       |
| `FEEDBACK_AUDIO_TOO_LONG`         | That recording is too long. Let's read just this verse, then press stop.                      | `quality = too_long` (not counted as an attempt; wording in review)     |
| `FEEDBACK_TEACHER_REVIEW`         | Blessed effort! Your teacher will listen to your recitation.                                  | `decision = uncertain` (the ayah goes to the teacher)                   |
| `FEEDBACK_RETRY_LIMIT_MOVE_ON`    | That's okay! Your teacher will help us with this verse. Let's move on to the next verse.      | Escalation after repeated attempts (only if the CRS change is approved) |
| `FEEDBACK_ANALYSIS_DELAYED`       | We're still listening to your recitation. We can go on to the next verse.                     | API fallback: `model = none`, AI down or timed out (Architecture §8.5)  |
| `FEEDBACK_SESSION_TIMEOUT`        | Thank you for your effort today! We'll continue tomorrow from where we stopped.               | Session `INCOMPLETE` after 10 minutes (FR-QUR-007)                      |

Every message will later need an audio file id, in Arabic and in English, in the script library.

---

## 4. Teacher escalation rules

1. **Low confidence:** a result below `CONFIDENCE_THRESHOLD` → `decision = uncertain` (the ayah
   goes to the teacher), and the child **moves on** (FR-QUR-006, VAL-006).
   - The current value, **0.70, is provisional and adjustable**. It is measured in week 4 (O-02),
     fixed in week 7, and may differ by category and level.
2. **The two models disagree:** muaalem's result differs from whisper-quran's word comparison →
   `uncertain`, sent to the teacher (Architecture §8.4).
3. **Time is up (10 minutes):** the session is `INCOMPLETE`, the parent is told, a note is created
   for the teacher, and the next session resumes from the same ayah (FR-QUR-007).
4. **The AI is down, slow, or switched off:** the attempt is saved, the ayah is marked `uncertain`,
   and the session continues (Architecture §8.4). When switched off, every ayah goes to the
   teacher's notes.
5. **Quality-gate rejection:** not counted as an attempt; the child is asked to record again
   (`FEEDBACK_AUDIO_UNCLEAR`).

### 4.1 Pending rule: attempt limit 🔶

**Current rule (in force):** the child does not move on until the reading is correct (FR-QUR-005).
This stays in force.

**Proposed change request for Mohammad and Ahmad:** if the child repeats the word `N` times without
success, the ayah is marked `uncertain` for the teacher and the child moves on with
`FEEDBACK_RETRY_LIMIT_MOVE_ON`, so the child is never stuck. The value of `N` (proposed: 2) is set
on approval. The session engine in the API (Ahmad) counts the attempts, not the result contract.
Not switched on before the CRS and Ahmad's state machine change.

---

## 5. Open items waiting for a decision

| #   | Item                                                                                                                                          | Who decides                                 |
| :-- | :-------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------ |
| 5.1 | The attempt-limit change request (§4.1)                                                                                                       | Mohammad + Ahmad                            |
| 5.2 | Approving `ERR_PRON_MADD_ASLI_SHORT` and the example مَٰلِكِ → مَلِكِ                                                                         | Qualified religious reviewer (O-04 / OD-07) |
| 5.3 | The expected madd lengths (muaalem settings), suited to children's tolerance                                                                  | Ismail + Qussai + religious reviewer        |
| 5.4 | The targeted rules per lesson (§2.1)                                                                                                          | Ismail + religious reviewer                 |
| 5.5 | The policy for extra words, repeats and restarts                                                                                              | Mohammad                                    |
| 5.6 | The final confidence threshold, by category and level                                                                                         | Week 4, then week 7 (O-02)                  |
| 5.7 | quran-muaalem licence: settled, QML 1.0. Version pinned (`quran-muaalem==0.3.0` in `services/ai/requirements-gpu.txt`)                        | Qussai                                      |
| 5.8 | Maximum length: 30 s of reading itself, recordings up to 60 s, result `quality: too_long` (changed 2026-11-15, waiting for Ismail's approval) | Qussai                                      |
