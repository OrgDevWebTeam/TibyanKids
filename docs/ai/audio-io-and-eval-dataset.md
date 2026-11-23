# Quran audio input/output and evaluation dataset requirements

- Owners: Qussai (AI 1) + Ismail (AI 2). Jira: KAN-9, KAN-27.
- Version: v1.4, 2026-11-17 (v1.3 was 2026-11-15, v1.2 was 2026-11-12, v1.1 was 2026-11-10, v1.0 was
  2026-11-05).
- Based on: CRS v3.0 (FR-QUR-002..004, VAL-014, VAL-016, SEC-006, SEC-011, SEC-017, SEC-018),
  Architecture v3.0 (§7.3, §8.1–8.7), Roadmap v3.0 (weeks 2–7).
- Related: `docs/contracts/ai-result.md` (the result), `docs/ai/teacher_annotation_guide.md`
  (how teachers label), `docs/ai/tajweed_taxonomy_and_feedback.md` (error codes),
  `services/ai/app/audio.py` (the gate described in A.3).

> 🔶 = proposal waiting for a decision. Everything else follows the CRS and Architecture.

## What changed in v1.4

| Section    | Change                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Status     | End of week 3: the gate and both models run behind the endpoint (#80), in Docker on the GPU machine (#83), called by the API (#85) |
| A.3        | The API answer for each audio error code is decided (open item 10)                                                                 |
| A.4        | Time per stage is logged (one JSON line per request)                                                                               |
| B.9        | `scripts/evaluate.py` makes the run file (#86)                                                                                     |
| Part C     | The test list is up to date                                                                                                        |
| Open items | 7, 10 and 11 done. 2, 3, 6, 8 and 9 carried to week 4                                                                              |

## What changed in v1.3

| Section | Change                                                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A.3     | The 30 s limit applies to the reading (first to last speech), not the recording. A recording may be up to 60 s                |
| A.3     | The models get the reading only: the silence before it is cut, and 3 s are kept after it for a long final madd                |
| A.3     | New signal-to-noise rule (below 15 dB → `too_noisy`) and loudness rule (speech below −50 dBFS → `silent`)                     |
| A.3     | The speech ratio is measured over the reading, so a child who waits before reading is no longer `too_noisy`                   |
| Part C  | Gate rule tests are back, with generated audio and a fake VAD (`tests/test_quality_gate.py`), so they run in CI without torch |

## What changed in v1.2

| Section | Change                                                                                     |
| ------- | ------------------------------------------------------------------------------------------ |
| A.3     | The gate now decodes any upload with ffmpeg and uses Silero VAD instead of an energy level |
| A.3     | `too_long` (over 30 s) is a quality value in the contract, not an error                    |
| A.3     | The "too short for the reference ayah" check is removed until the new word timings exist   |
| Part C  | Gate tests removed. Only the contract test is kept                                         |

## Status at the end of week 3

| Piece                          | State                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Decode (ffmpeg) and gate       | `app/audio.py`, run by the endpoint (`app/pipeline.py`) with `MOCK_MODE=false`                                          |
| Endpoints                      | Real models with `MOCK_MODE=false` (#80), also in Docker (`Dockerfile.gpu`, #83). Mock mode stays the laptop default    |
| Quality values in the contract | `ok`, `silent`, `too_short`, `too_noisy`, `too_long`                                                                    |
| Word timings                   | Set by hand for the 25 ayat (`reference_word_timings.json`), validator passes. Every finding gets its word's segment    |
| Evaluation                     | `scripts/evaluate.py` (#86), tried on a smoke dataset made from the reference recitation. Children's recordings: week 4 |

---

## Part A. Audio input and output

### A.1 Path of one recording

1. The browser records one ayah with `MediaRecorder` (Osama).
2. The API receives it on `POST /api/v1/children/:id/recitation-attempts`, checks the child's
   consent, the type and the size, and sends it to the AI service (Ahmad). The audio is kept in
   memory only and is not stored (retention: OD-04).
3. The AI service converts it, runs the quality gate, runs the models, and returns one result in
   the contract format (Qussai).
4. The API saves the result inside the attempt and returns it to the browser in the same request.

### A.2 What the API accepts (VAL-016)

| Rule              | Value                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types             | Audio only. Expected from browsers: `audio/webm` (Chrome, Edge, Android), `audio/mp4` (Safari, iOS). Also allowed: `audio/ogg`, `audio/wav`, `audio/mpeg` |
| Size              | Max 5 MB                                                                                                                                                  |
| File name         | Random (`crypto.randomUUID()`), never the child's name                                                                                                    |
| One ayah per file | Yes. The form also sends `surah`, `ayah`, `level`, `attemptId`                                                                                            |

The 5 MB limit is a size limit, not a duration limit. A small compressed file can hold a long
recording, so duration is checked after decoding (A.3).

### A.3 What the AI service does with the audio

| Step         | Rule                                                                                                                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read         | The upload is read up to the 5 MB limit plus one byte, so an oversized file is rejected without loading it fully                                                                                                                                            |
| Convert      | ffmpeg → 16 kHz, mono samples. The upload is written to a temporary folder that is deleted right after. ffmpeg runs without a shell, with a 15 s timeout, and decodes at most 61 s, so a small file that holds a very long recording is never decoded fully |
| Quality gate | Silero VAD, loudness, signal-to-noise and clipping checks (`audio.py`). Result: `quality` = `ok`, `silent`, `too_short`, `too_noisy` or `too_long`                                                                                                          |
| Reference    | The AI service loads the expected ayah text from `reference_quran_text.json` by `surah` + `ayah` (`app/reference.py`). It never searches the whole Quran                                                                                                    |
| Models       | quran-muaalem (pronunciation and tajweed) and whisper-quran (word comparison), merged into one list of findings (`app/combine.py`). No generative language model is used in this path: the decision is deterministic and rule-based (`policy.py`)           |
| Output       | One result in the contract format. Model text is never returned to the API                                                                                                                                                                                  |

#### Gate measurements

| Measure        | Definition                                                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duration       | Decoded samples ÷ 16000                                                                                                                                                                              |
| Speech seconds | Total length of the speech parts Silero VAD finds, with its threshold at 0.2 (`VAD_THRESHOLD`). The default 0.5 missed long madd and ghunna sounds, so clean recordings were rejected as `too_noisy` |
| Speech dBFS    | Loudness (RMS in dB below full scale) of the speech parts only                                                                                                                                       |
| SNR            | Signal-to-noise ratio of the whole recording: the 95th percentile of the 20 ms frame levels minus the 10th percentile (the background between and around the words)                                  |
| Reading        | From the start of the first speech part to the end of the last one: the reading without the silence around it                                                                                        |
| Speech ratio   | Speech seconds ÷ reading seconds                                                                                                                                                                     |
| Clipped ratio  | Samples with an absolute value of at least 32000 (16-bit) ÷ all samples                                                                                                                              |

#### Order of checks

The first match wins.

1. The file cannot be decoded → **error** (table below).
2. Recording above 60 s → `too_long`.
3. Recording below 30 ms (or empty) → `too_short`.
4. Clipped ratio above 1% → `too_noisy`.
5. Speech seconds below 0.3 → `silent`.
6. Speech dBFS below −50 → `silent`.
7. SNR below 15 dB → `too_noisy`. Checked after the speech checks: a recording without speech has no
   contrast either, but it is `silent`, not noisy.
8. Reading above 30 s → `too_long`.
9. Speech ratio below 0.30 → `too_noisy`.
10. Otherwise → `ok`. The models get the reading, from 0.25 s before it to 3 s after it.

All values are starting values, named constants at the top of `services/ai/app/audio.py`, tuned
later against real recordings.

#### Why 30 s of reading

The longest prototype ayah takes about 15 s to recite (114:1 in the reference recitation), children
often read at half the reciter's speed (about 30 s), and Whisper's model input is a 30 s window, so
a longer reading would be cut and create false omissions. The limit applies to the reading, not the
recording: a child who waits before reading, or forgets to press stop, is not rejected. A
`too_long` recording is never reported as `too_noisy`: the child would be told to move closer to the
microphone. The child hears `FEEDBACK_AUDIO_TOO_LONG` (text by Ismail).

#### Why 3 s after the reading

Silero VAD stops hearing a long final madd early. In 1:4 it reports the speech ending at 2.6 s, while
the madd of ٱلدِّينِ lasts until 4.6 s. With only 0.25 s kept after the reading, quran-muaalem
reported a missing letter in that word. With 3 s kept, both models give the same results as on the
untrimmed recordings for all 25 reference ayat.

#### How the SNR and loudness values were chosen (2026-11-15)

Measured on the GPU machine with the 25 reference recordings, changed in memory only (white noise
added, volume lowered, silence put before the reading). "Misread" means whisper-quran did not return
the ayah's words. "Old gate" is the v1.2 gate (30 s per recording, speech ratio over the whole
recording, no SNR rule).

| Condition (25 recordings each) | SNR min / median | Misread | Old gate: passed but misread | Old gate: rejected but read correctly | New gate: passed but misread | New gate: rejected but read correctly |
| ------------------------------ | ---------------- | ------- | ---------------------------- | ------------------------------------- | ---------------------------- | ------------------------------------- |
| Clean                          | 22.9 / 36.3 dB   | 0       | 0                            | 0                                     | 0                            | 0                                     |
| 8 s of waiting before reading  | 30.8 / 34.7 dB   | 0       | 0                            | 5                                     | 0                            | 0                                     |
| 20 s of waiting before reading | 28.0 / 32.5 dB   | 1       | 0                            | 24                                    | 1 \*                         | 0                                     |
| Noise σ 0.01                   | 17.6 / 21.7 dB   | 1       | 1                            | 0                                     | 1                            | 0                                     |
| Noise σ 0.02                   | 12.0 / 16.0 dB   | 5       | 5                            | 0                                     | 4                            | 6                                     |
| Noise σ 0.04                   | 6.9 / 10.3 dB    | 10      | 10                           | 1                                     | 0                            | 15                                    |
| Noise σ 0.06                   | 4.5 / 7.3 dB     | 18      | 18                           | 1                                     | 0                            | 7                                     |
| Noise σ 0.09                   | 2.7 / 4.9 dB     | 25      | 20                           | 0                                     | 0                            | 0                                     |
| Noise σ 0.12                   | 1.9 / 3.3 dB     | 25      | 15                           | 0                                     | 0                            | 0                                     |
| Volume −20 dB                  | 12.1 / 16.0 dB   | 6       | 6                            | 1                                     | 5                            | 6                                     |
| Volume −30 dB                  | 4.1 / 6.9 dB     | 23      | 7                            | 0                                     | 0                            | 2                                     |
| **Total**                      |                  |         | **82**                       | **32**                                | **11**                       | **36**                                |

\* Measured on the whole 35 s recording, which Whisper cuts at 30 s. With the new gate the models get
the trimmed reading instead.

Whisper starts to misread below about 17 dB, and clean recordings never go below 22.9 dB, so the
limit is 15 dB. The new gate lets 11 misread recordings through instead of 82. It rejects about as
many readable recordings as the old gate (36 vs 32), but noisy ones instead of clean ones where the
child waited; a rejection only asks the child to record again. White noise is only a stand-in: the
values must be checked again on real children's recordings (week 4). The loudness rule is a
backstop for near-silence; quiet speech fails because of the background, which the SNR rule catches.

#### Audio errors

These are not quality results: the audio could not be read at all. All are `AudioError` with a code.

| Code             | Meaning                           |
| ---------------- | --------------------------------- |
| `EMPTY_AUDIO`    | The file has no bytes             |
| `DECODE_FAILED`  | ffmpeg cannot read it (not audio) |
| `DECODE_TIMEOUT` | ffmpeg took longer than 15 s      |

The AI service answers `400` with the code, in its error shape `{"error": {"code", "message"}}`
(`docs/contracts/ai-result.md`). The API saves no attempt and asks the child to record again (`422`,
`"status": "record_again"`), like a quality-gate rejection (open item 10).

### A.4 Output

The result format is `docs/contracts/ai-result.md`. Debug detail stays inside the AI service:

| Logged per request (no audio, no names)                                                                                            | Why                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `attemptId`, `surah`, `ayah`, `level`                                                                                              | Join with the attempt in the API                                              |
| Gate report: `quality`, `durationSeconds`, `clippedRatio`, `speechSeconds`, `speechDbfs`, `snrDb`, `readingSeconds`, `speechRatio` | Architecture §8.7 and quality-gate tuning (the report from `check_quality()`) |
| The error `code` when the audio was rejected by an error                                                                           | Count guard and format rejections                                             |
| Per model: name, version, status (`ok`, `timeout`, `error`, `disabled`), inference ms                                              | Latency target (NFR-PERF-003), kill switch                                    |
| Per finding: `code`, `wordIndex`, `confidence` (the contract fields, no text)                                                      | Error analysis without any transcript                                         |
| Time per stage (decode, gate, each model)                                                                                          | Find the slow step                                                            |

Logs never contain audio, transcripts, phoneme strings of what the child said, child names or
parent data (NFR-OBS-001, SEC-011). Contract v3.0 carries no phoneme or transcript text, and the
gate report holds numbers only.

**Phoneme diagnostics are not logged.** The predicted phonemes of a recitation are a phonetic
transcript of the child's speech, so they never go to request logs or app telemetry. For error
analysis (week 6), an offline evaluation run may keep per-recording model output, including phoneme
detail, only inside the restricted `tibyan-eval/` folder (B.4), only for recordings whose consent
covers model use (SEC-017).

---

## Part B. Evaluation dataset requirements

### B.1 What the dataset is for

| Week               | Use                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------- |
| 4                  | Benchmark the models, choose the main model and the first threshold (OD-02)         |
| 6                  | Decide whether to fine-tune; measure the new model or rules                         |
| 7                  | Regression run before the release candidate; final threshold with teacher decisions |
| Every model change | One run on the untouched test set (Roadmap §7)                                      |

### B.2 Size and coverage

| Requirement          | Value                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Children             | 30 non-native Arabic speakers aged 6–14, about 10 per age band (6–8, 9–11, 12–14)                                                                                                 |
| Ayahs                | All 25 ayahs of the 5 surahs, from every child                                                                                                                                    |
| Recordings           | 750 child recordings (30 × 25)                                                                                                                                                    |
| Labels               | Every word labeled by 2 teachers independently (annotation guide §5)                                                                                                              |
| Extra error examples | Recordings from consenting adults with deliberate errors (`source: seeded_adult`), mainly for rare tajweed errors. **Reported separately, never mixed into the decision numbers** |
| Conditions           | Recorded with the same browser recording path as the app, at home, on the family's own device. Natural noise is kept; the quality gate is part of what we test                    |

### B.3 Consent and privacy (must be true before a recording is opened)

1. A **separate written parental consent** for using the recording to test or train models
   (SEC-017). Each recording carries a `consentId`.
2. Recordings and labels stay on our machines in a **restricted folder on the GPU machine**, never
   in git, cloud drives, spreadsheets or AI tools (SEC-011, SEC-018). This includes test fixtures:
   automated tests use synthetic audio only, never a child's recording.
3. Only anonymous ids (`recordingId`, `speakerId`). The list linking ids to families is kept by
   Mohammad, outside the dataset folder.
4. Withdrawn consent → the recording, its labels and any derived files are deleted (VAL-008).
5. Retention follows OD-04 (week 4, carried from week 3).

### B.4 Folder layout (on the GPU machine only)

Made by `services/ai/scripts/prepare_dataset.py` from a folder of `SPK_xxx/<surah>_<ayah>.wav`
recordings (`layout`, `split`, `import-labels`, `freeze`). Recording ids are
`REC_<speaker>_<surah>_<ayah>`.
The folder is `datasets/tibyan-eval` in the repository, which `.gitignore` and `.dockerignore` both
leave out. The script refuses any other folder in the repository.

```text
tibyan-eval/                      restricted, access logged
├── audio/<recordingId>.<ext>   original upload, never edited
├── recordings.jsonl            one line per recording (B.5)
├── labels.jsonl                one line per word per teacher (B.6)
├── splits.json                 frozen speaker lists for train / dev / test (B.7)
├── outputs/<run name>/         what the gate and each model found, per recording, before any
│                               decision (scripts/run_models.py). Numbers and codes only, but it
│                               stays here and never goes to logs, git or telemetry
└── runs/<date>-<model>.json    one file per evaluation run (B.9)
```

### B.5 One recording (`recordings.jsonl`)

| Field           | Example      | Meaning                                                                       |
| --------------- | ------------ | ----------------------------------------------------------------------------- |
| `recordingId`   | `REC_0001`   | Anonymous id                                                                  |
| `speakerId`     | `SPK_017`    | Anonymous speaker, used for the split                                         |
| `consentId`     | `CON_017`    | The separate model-use consent                                                |
| `source`        | `child`      | `child` or `seeded_adult`                                                     |
| `ageBand`       | `9-11`       | `6-8`, `9-11`, `12-14`                                                        |
| `surah`, `ayah` | `1`, `4`     | Which ayah                                                                    |
| `device`        | `phone`      | `phone`, `tablet`, `laptop`                                                   |
| `mimeType`      | `audio/webm` | As uploaded                                                                   |
| `recordedAt`    | `2026-11-12` | Date only                                                                     |
| `audioQuality`  | `ok`         | `ok` or `poor_audio`, from the gold labels                                    |
| `split`         | `test`       | `train`, `dev` or `test`, copied from `splits.json` after the split is frozen |

### B.6 One word label (`labels.jsonl`)

Same fields as the annotation guide §4, in camelCase:

| Field             | Example                   | Meaning                                                  |
| ----------------- | ------------------------- | -------------------------------------------------------- |
| `recordingId`     | `REC_0001`                |                                                          |
| `wordIndex`       | `3`                       | **1 = first word**, same as the contract                 |
| `annotatorId`     | `TCH_02`                  |                                                          |
| `round`           | `1`                       | `1` = independent label, `2` = reviewer's final decision |
| `teacherDecision` | `needs_practice`          | `correct`, `needs_practice`, `poor_audio`                |
| `errorCodes`      | `["ERR_PRON_LETTER_SUB"]` | Codes from the contract; empty when correct              |
| `notes`           |                           | Short, never names                                       |

**Gold label for a word:** the two round-1 labels when they agree, otherwise the reviewer's round-2
label. A recording where the gold label is `poor_audio` is a quality-gate test case only.

**Week 4 dataset: one teacher.** The 17 children's recordings are labelled by a single teacher, so
each word has one round-1 label, and that label is the gold label (`prepare_dataset.py
import-labels`, teacher id `TCH_01`). There is no second opinion and no agreement measure (kappa),
so the week 4 numbers carry the labelling errors of one person. The report must say so.

### B.7 Split

- Split **by speaker**, never by recording, so one child is never in two parts.
- Week 4 (17 children, decided by Qussai): **test 11 children** (275 recordings), **dev 6 children**
  (150 recordings), **train none**. Balanced by age band. A week 6 fine-tune would need new
  recordings, because the test set is never used for training.
- The split is decided **before labelling** (`prepare_dataset.py split`, from `speakers.csv`), so
  the teacher labels the dev children first and tuning can start early. The hashes are stored only
  when every test recording is labelled (`prepare_dataset.py freeze`).
- **The train split is consent-gated and unused for now.** A recording can be used for training
  only if its consent covers model use (SEC-017) and a fine-tuning decision has been approved
  (B.1, week 6). Until then recordings are used for evaluation only, and no model is trained on them.
- **The threshold is tuned on dev and confirmed on test.** Tuning on the test set would make its
  numbers look better than reality.
- The test set is frozen once the children's recordings are labelled (week 4, carried from week 3). `splits.json` stores the speaker lists and a SHA-256
  of `recordings.jsonl` and `labels.jsonl`. Nothing in the test set is used for tuning or training.

### B.8 What we measure

Each analysed recording gets the model decision at **all three levels**, compared with the gold
labels and the stopping rules of that level (CRS §5.4).

| Metric                 | Definition                                                              | Why it matters                                             |
| ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| False reject rate      | Gold: no stopping error. Model: `error`                                 | A child is stopped for a correct reading                   |
| False accept rate      | Gold: a stopping error. Model: `accepted`                               | A real mistake passes                                      |
| Word location accuracy | When both say error, the model points to the same `wordIndex`           | Wrong word replayed = confusing                            |
| Uncertain rate         | Share of analysed recordings that come back `uncertain`                 | Teacher workload                                           |
| Quality gate           | Precision and recall of rejections against gold `poor_audio`            | Children asked to re-record for nothing, or noise analysed |
| Latency                | p50 and p95 seconds per ayah on the GPU machine, per model and combined | NFR-PERF-003 target (week 4)                               |

Every number is reported overall, per error category, per age band and per level. Seeded adult
recordings get their own table.

**How the quality gate is measured.** The `quality` value and the gate report come from the request
log (A.4), joined to the recording by `attemptId`, and are compared with the gold `poor_audio`
label. Recordings stopped by the duration guard or by a format error are not quality results, so
they are counted separately as "guard rejections" and are not part of precision and recall.

🔶 Starting targets for discussion in week 4 (not approved): false reject ≤ 5%, false accept ≤ 15%
for memorization errors, uncertain rate ≤ 30%. False rejects matter more than false accepts,
because the teacher still checks a sample of accepted ayahs (FR-LIVE-005).

### B.9 One evaluation run (`runs/*.json`)

Two steps. `services/ai/scripts/run_models.py <tibyan-eval folder>` runs the gate and both models
once on every recording (the GPU part) and saves what they found in `outputs/<run name>/`
(`app/saved_outputs.py`). It also saves every gate measurement, even after a failed rule, so the
gate can be tuned without running it again. Then
`services/ai/scripts/evaluate.py <tibyan-eval folder> --split dev|test [--outputs <run name>]` works
out the merge and the decisions from those outputs with today's policy and threshold, in seconds
(the numbers: `services/ai/app/evaluation.py`). A test run is refused when `recordings.jsonl` or
`labels.jsonl` no longer match the SHA-256 values frozen in `splits.json`.

Stores: model names and exact versions, the decision-policy version, threshold, dataset hash from
`splits.json`, which split was used, every metric from B.8, and the date. A run file holds metrics
and versions only, no audio, transcripts or phoneme text. Runs are kept for the AI pilot report
(week 8).

---

## Part C. Tests

Everything below runs in CI without a GPU or any child's recording (generated audio, fake models):

| Test                                           | What it checks                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `tests/test_quality_gate.py`                   | The gate rules, with generated audio and a fake VAD                     |
| `tests/test_pipeline.py`, `tests/test_main.py` | The real pipeline and the endpoints: errors, rejections, the lock, logs |
| `tests/test_contract.py`                       | The result format follows the contract's JSON Schema                    |
| `tests/test_evaluation.py`                     | The evaluation numbers of B.8                                           |

On real audio, the GPU machine runs `services/ai/scripts/run_real_audio.py` on the 25 reference
recordings after every model change, and `scripts/evaluate.py` on the labelled dataset (Part B).

---

## Open items

| #   | Item                                                                                                                             | Who decides                   | Needed by                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------- |
| 1   | ✅ Decided: 30 s, `quality: too_long` in the contract                                                                            | Qussai                        | Done                                     |
| 2   | Quality gate values (A.3): starting values are in the code, to be tuned                                                          | Qussai, from labels           | Week 4 (needs the children's recordings) |
| 3   | Split sizes (B.7)                                                                                                                | Qussai + Ismail               | Week 4 (needs the children's recordings) |
| 4   | Target numbers (B.8)                                                                                                             | Mohammad, from week 4 numbers | Week 4                                   |
| 5   | Who keeps the id-to-family list (B.3)                                                                                            | Mohammad                      | Week 2, before recordings start          |
| 6   | Retention of evaluation recordings after the pilot (OD-04)                                                                       | Mohammad                      | Week 4 (carried from week 3)             |
| 7   | ✅ Done: Silero VAD and a signal-to-noise rule (below 15 dB → `too_noisy`, #54)                                                  | Qussai                        | Done                                     |
| 8   | Speech ratio floor, from real children (the ratio is measured over the reading since v1.3)                                       | Qussai + Ismail               | Week 4 (needs the children's recordings) |
| 9   | Browser capture: format and constraints (echo cancellation, noise suppression, gain), from a capture test with adult volunteers  | Osama + Ismail                | Week 4 (carried from week 3)             |
| 10  | ✅ Done: audio error codes → `400` from the AI service (#80), "record again" from the API (#85). `FEEDBACK_AUDIO_TOO_LONG` (#58) | Ahmad + Qussai + Ismail       | Done                                     |
| 11  | ✅ Done: `400 AYAH_NOT_SUPPORTED` before the audio is read (#80); the API checks the 25 ayat first (#85)                         | Qussai                        | Done                                     |
