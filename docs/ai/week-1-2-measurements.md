# AI week 1–2 measurements

- Owner: Qussai (AI 1). Reviewed by: Ismail (AI 2).
- Measured: 2026-11-15, on the GPU machine.
- Evidence for the week 1 exit gate ("first real model run measured") and the week 2 exit gate
  ("quality gate and both adapters run on real audio"), AI Roadmap v3.0.

Numbers only. No recordings are in the repository (it is public): the reference recitation of the
25 prototype ayat is kept outside git in `datasets/reference-recitation/`.

> **Update, week 3 (2026-11-17).** This page is a record of weeks 1–2 and is kept as measured. Since
> then: the two models are merged and connected to `POST /v1/recitation/analyze` (#79, #80), they
> run in Docker on the GPU machine (#83), the API sends recordings and saves the results (#85), and
> `services/ai/scripts/evaluate.py` measures them on a labelled dataset (#86). Current state:
> `services/ai/README.md` and `docs/ai/audio-io-and-eval-dataset.md` ("Status at the end of week 3").

## What was measured

| Item       | Value                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| Audio      | The reference recitation of the 25 prototype ayat (one adult professional reciter, one mp3 per ayah) |
| Code       | The AI service with the week-2 fixes combined (list below)                                           |
| Level      | `beginner`                                                                                           |
| Repeats    | 1 warm-up pass (not counted), then 3 timed passes: 75 analyses                                       |
| Hub access | Off (`HF_HUB_OFFLINE=1`): only the pinned model files already on disk were used                      |

The code was the combination of these pull requests, before they were merged:

| Plan | Branch                           | Commit    | What                                                          |
| ---- | -------------------------------- | --------- | ------------------------------------------------------------- |
| A1   | `test/ai-policy-word-compare`    | `9ddff92` | Unit tests for the policy and the word comparison             |
| A2   | `fix/ai-whisper-plain-spelling`  | `d8ca540` | whisper compared with Imlaei reference words                  |
| A3   | `fix/ai-whisper-word-confidence` | `e29ddf7` | Per-word confidence in the whisper adapter                    |
| A3b  | `fix/ai-whisper-output-cap`      | `0860efc` | whisper output capped so a looping model cannot crash the GPU |
| A4   | `fix/ai-quality-gate`            | `349c606` | Quality gate: reading length, trimming, signal-to-noise rule  |
| A5   | `fix/ai-reference-data-path`     | `fcbeff9` | Reference data path for Docker                                |
| A6   | `chore/ai-pin-model-revisions`   | `cd1bc65` | Model revisions pinned                                        |

## Machine and versions

| Item                 | Value                                                |
| -------------------- | ---------------------------------------------------- |
| GPU                  | NVIDIA GeForce RTX 3080, 12 GB, driver 591.86        |
| CUDA (PyTorch build) | 13.0                                                 |
| OS / Python          | Windows 11 / 3.12.10                                 |
| torch / transformers | 2.14.1+cu130 / 4.57.6                                |
| quran-muaalem        | 0.3.0, model `obadx/muaalem-model-v3_2@01a1ef9fbe40` |
| whisper-quran        | `tarteel-ai/whisper-base-ar-quran@5c3c53fdf927`      |
| Silero VAD           | 6.2.3                                                |

## Week 1 gate: first real model run

### GPU memory

| Moment                       | Allocated by PyTorch |
| ---------------------------- | -------------------- |
| Both models loaded           | 1.40 GB              |
| Peak during the 100 analyses | 1.57 GB              |

Both models fit comfortably on the 12 GB card, which leaves room for the Arabic word model
(faster-whisper, week 5). These are PyTorch allocations; the process uses a little more (CUDA
context).

### Load time (from the local disk cache)

| Model         | Seconds |
| ------------- | ------- |
| quran-muaalem | 1.12    |
| whisper-quran | 0.61    |
| Silero VAD    | 0.24    |

Models are loaded once when the service starts, not per request.

### Time per ayah

Milliseconds per analysis, one request at a time, 75 analyses.

| Stage                     | Median | 95th percentile | Worst |
| ------------------------- | ------ | --------------- | ----- |
| Decode (ffmpeg)           | 29     | 35              | 44    |
| Quality gate (Silero VAD) | 52     | 112             | 149   |
| quran-muaalem             | 434    | 596             | 719   |
| whisper-quran             | 656    | 878             | 1686  |
| **Total**                 | 1167   | 1540            | 2479  |

The worst case is 2.5 s against the 20 s limit (NFR-PERF, `AI_TIMEOUT_MS`), with both models run one
after the other. The latency target itself is set in week 4 (NFR-PERF-003). A child's recording
can be longer than the reciter's (up to 30 s of reading), so these numbers must be measured again on
children's recordings. A looping whisper run that stops at the output cap took 6.9 s (A3b).

## Week 2 gate: quality gate and both adapters on real audio

### Quality gate

| Input                                                      | Result                                  |
| ---------------------------------------------------------- | --------------------------------------- |
| The 25 reference recordings                                | 25 `ok`                                 |
| Their signal-to-noise ratio                                | 22.9 dB or more (limit 15 dB)           |
| Longest reading (first to last speech) / longest recording | 13.7 s / 14.9 s (limit 30 s of reading) |
| Generated: digital silence, 3 s                            | `silent`                                |
| Generated: room noise at −54 dBFS, 3 s and 10 s            | `silent`                                |
| Generated: loud white noise at −20 dBFS, 3 s, no speech    | `silent` \*                             |
| Generated: 10 samples                                      | `too_short`                             |
| Generated: room noise, 70 s                                | `too_long`                              |

\* Silero VAD hears no speech in it, so it is `silent` rather than `too_noisy`. The child hears the
same message for both (`FEEDBACK_AUDIO_UNCLEAR`).

How the gate handles noisy, quiet and late-started readings, compared with the old gate, is measured
in `docs/ai/audio-io-and-eval-dataset.md` (A.3, "How the SNR and loudness values were chosen").

### Both adapters on the reference recitation

Every recording is a correct reading by a professional reciter, so the expected result is
`accepted` for all 25.

| Model         | `accepted` | `uncertain`      | `error` |
| ------------- | ---------- | ---------------- | ------- |
| quran-muaalem | 23         | 2 (108:1, 113:3) | 0       |
| whisper-quran | 25         | 0                | 0       |

- **whisper-quran:** 25 of 25. Before A2, 1:1, 1:3 and 114:3 were wrongly `error` at every level
  (Uthmani vs Imlaei spelling of الرحمن and إله).
- **quran-muaalem:** 108:1 is `uncertain` because of `ERR_TAJ_UNMAPPED` on word 1 (a tajweed rule
  we do not map yet), and 113:3 because of `ERR_PRON_LETTER_SUB` on word 3 with confidence 0
  (a deleted phoneme). Both are correct readings sent to the teacher. They are not caused by the
  gate: the untrimmed recordings give the same results. To look at in week 3 (merging the two models)
  and in Ismail's mapping review.

## What these numbers do not show

- **Children.** One adult professional reciter, in the models' own domain. Accuracy, confidence and
  time on non-native children's recordings are the week 4 evaluation (A-001).
- **Errors.** All 25 readings are correct, so false accepts (an error that passes) are not measured
  here. That needs recordings with known errors (evaluation test set, week 4).
- **Several children at once.** One request at a time. The load test is week 5 (A-007).
- **The API path.** The week 1 gate also asks that a mock result travels API → AI service → API and
  is saved. The API's AI client and attempts flow were removed with the old API (#41) and must be
  rebuilt by Ahmad before that part of the gate passes again.
- **The endpoint.** The real models are not connected to `POST /v1/recitation/analyze` yet (week 3);
  these numbers come from `scripts/run_real_audio.py`-style runs of the same code.
