# AI week 4 evaluation: the children's recordings

- Owner: Qussai (AI 1). Measured: 2026-11-24, on the GPU machine (RTX 3080, 12 GB).
- Decides: OD-02 (main model and first threshold), see
  [ADR-0011](../adr/0011-recitation-whisper-quran-threshold-095.md).
- Code: `services/ai/scripts/prepare_dataset.py`, `run_models.py`, `evaluate.py`,
  `sweep_threshold.py` (dataset doc, Part B).

Numbers only. The recordings, the labels and every run file stay in `datasets/tibyan-eval/` on the
GPU machine (ignored by git). No child's words and no teacher's notes are in this report.

## 1. What was measured

| Item      | Value                                                                                       |
| --------- | ------------------------------------------------------------------------------------------- |
| Children  | 17 (age 6-8: 4, 9-11: 5, 12-14: 8), 25 ayat each, 425 recordings                            |
| Labels    | **One teacher** (`TCH_01`), every word of every recording: 1649 words, 0 problems on import |
| Split     | By child, the same share of each age band: test 11 (5 / 3 / 3), dev 6 (3 / 2 / 1), train 0  |
| Dataset   | Frozen on 2026-11-24 (SHA-256 of `recordings.jsonl` and `labels.jsonl` in `splits.json`)    |
| Models    | `quran-muaalem` 0.3.0 `obadx/muaalem-model-v3_2@01a1ef9fbe40`                               |
|           | `whisper-quran` `tarteel-ai/whisper-base-ar-quran@5c3c53fdf927`                             |
| Model run | `outputs/2026-11-24-snr10`: the gate and both models once on all 425, gate at 10 dB         |
| Tuning    | Dev only. Test was evaluated **once**, at the end, with the chosen model and threshold      |
| Targets   | The B.8 starting targets (not approved): false reject ≤ 0.05, false accept on memorization  |
|           | ≤ 0.15, uncertain ≤ 0.30. Mohammad's targets were not given yet                             |

The first split took the age bands in turn into test first, so dev had no child aged 6-8. It was
redone before any label was imported, so every band is in both parts.

## 2. Decisions taken this week (all by Qussai)

| What                   | Before                 | Now                                | Why                                                                          |
| ---------------------- | ---------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| Split                  | Bands in turn          | The same share of every band       | Dev had no 6-8 child to tune on                                              |
| Gate `MIN_SNR_DB`      | 15 dB                  | 10 dB                              | §4: the rule rejected 6 good recordings and caught no poor one               |
| Main model             | Both models combined   | `whisper-quran` decides alone      | §3: combined was 64% uncertain on dev at the threshold that met false reject |
| Threshold (OD-02)      | 0.70 (provisional)     | 0.95                               | §3: closest to the targets on dev; 0.95-0.97 give the same numbers           |
| `ERR_TAJ_MADD_SHORT`   | Could stop at advanced | Reminder only (`NOT_YET_APPROVED`) | §5: 7 madd words flagged on dev, all wrong                                   |
| The 3 unapproved codes | Off                    | Still off                          | §5: the models almost never produce them                                     |

## 3. Decisions: dev sweep, then one test run

Rates per recording that passed the gate and that the teacher did not mark `poor_audio`.
**False reject:** the child is stopped although the teacher found no stopping error. **False
accept:** the child goes on although the teacher found one. **Uncertain:** the ayah goes to the
teacher. Intermediate and advanced give the same numbers, because no lesson targets a tajweed rule
in this evaluation.

### Dev sweep (146 recordings), the best row of each model

No model met all three targets at any threshold from 0.50 to 0.99. Lowering false rejects always
raised uncertain.

| Model, threshold        | FR beginner / intermediate | FA memorization | FA intermediate | Uncertain |
| ----------------------- | -------------------------- | --------------- | --------------- | --------- |
| quran-muaalem, 0.70     | 0.0 / 0.153                | 0.27 / 0.09     | 0.17            | 0.34      |
| quran-muaalem, 0.95     | 0.0 / 0.036                | 0.18 / 0.09     | 0.14            | 0.53      |
| combined, 0.70          | 0.074 / 0.144              | 0.0 / 0.0       | 0.057           | 0.50      |
| combined, 0.95          | 0.015 / 0.027              | 0.0 / 0.0       | 0.029           | 0.64      |
| whisper-quran, 0.70     | 0.170 / 0.135              | 0.0 / 0.0       | 0.20            | 0.31      |
| **whisper-quran, 0.95** | **0.059 / 0.045**          | **0.0 / 0.0**   | **0.20**        | **0.42**  |
| whisper-quran, 0.99     | 0.037 / 0.018              | 0.0 / 0.0       | 0.20            | 0.45      |

whisper-quran at 0.95 misses only the uncertain target (0.42) and false reject at beginner by
0.009 (one recording in 135 is 0.007). 0.99 meets false reject but asks for near-certainty on
every finding, which is too close to these 6 children. Combined is the most accurate but sends
two ayat in three to the teacher.

### whisper-quran at 0.95, dev and test

| Split, level       | Analysed | Gold: no stop / stop | False reject | False accept | FA memorization | Word located | Uncertain |
| ------------------ | -------- | -------------------- | ------------ | ------------ | --------------- | ------------ | --------- |
| dev, beginner      | 146      | 135 / 11             | 0.059 (8)    | 0.0 (0)      | 0.0 (0 of 11)   | 1.0          | 0.42      |
| dev, intermediate  | 146      | 111 / 35             | 0.045 (5)    | 0.20 (7)     | 0.0 (0 of 11)   | 0.83         | 0.42      |
| test, beginner     | 272      | 267 / 5              | 0.0075 (2)   | 0.0 (0)      | 0.0 (0 of 5)    | 1.0          | 0.28      |
| test, intermediate | 272      | 257 / 15             | 0.0039 (1)   | 0.20 (3)     | 0.0 (0 of 5)    | 1.0          | 0.28      |

On test all three starting targets are met. **Read the test numbers with care:** the test children
made far fewer stopping errors (5 and 15 recordings of 272) than the dev children (11 and 35 of
146), so one recording moves a test false accept by 0.07 to 0.20. The dev numbers are the better
guide to what the pilot will see.

The false accepts at intermediate are pronunciation errors: whisper-quran writes down words, so a
wrong vowel or letter is caught only when it changes the word. On dev 7 of 28 recordings with a
pronunciation error were accepted (0.25), on test 3 of 10 (0.30).

### By age band (whisper-quran at 0.95)

| Split | Age band | Analysed | FR beginner | FR intermediate | FA intermediate | Uncertain |
| ----- | -------- | -------- | ----------- | --------------- | --------------- | --------- |
| dev   | 6-8      | 24       | 0.0         | 0.0             | 0.20 (1 of 5)   | **0.92**  |
| dev   | 9-11     | 50       | 0.12        | 0.077           | 0.09 (1 of 11)  | 0.42      |
| dev   | 12-14    | 72       | 0.032       | 0.038           | 0.26 (5 of 19)  | 0.26      |
| test  | 6-8      | 73       | 0.014       | 0.015           | 0.13 (1 of 8)   | **0.53**  |
| test  | 9-11     | 75       | 0.013       | 0.0             | 0.67 (2 of 3)   | 0.23      |
| test  | 12-14    | 124      | 0.0         | 0.0             | 0.0 (0 of 4)    | 0.17      |

The youngest children are the hardest: the model is unsure on half to nine tenths of their ayat,
so their teacher reviews most of them. Dev has only one child aged 6-8.

## 4. Quality gate

| Measure                                 | At 15 dB (all 425)                   | At 10 dB (all 425) |
| --------------------------------------- | ------------------------------------ | ------------------ |
| Rejected by the gate                    | 6 (all `too_noisy`, SNR 7.7-14.4 dB) | 1 (7.7 dB)         |
| ... of which the teacher said were fine | 6                                    | 1                  |
| Teacher `poor_audio` recordings         | 6 (3 dev, 3 test)                    | 6                  |
| ... of which the gate passed            | 6 (SNR 17.3-32.2 dB)                 | 6                  |

The gate and the teacher never agreed. What the teacher calls poor audio is not noise the gate
measures: the 6 recordings pass every gate value (SNR, loudness, clipping, speech ratio). On the
3 dev ones (threshold 0.70), quran-muaalem answered `uncertain` on all 3 and whisper-quran on 2;
it stopped the child on the third. The two dev recordings that pass at 10 dB but not at 15 dB got
no wrong answer (`uncertain`, or `accepted` where the teacher found no stopping error).

10 dB is a judgment from 3 dev cases: the week 1-2 white-noise test had Whisper misreading below
about 17 dB, and no recording here was really noisy. The other gate values did not reject anything
and are unchanged.

## 5. Error codes

Word by word on dev (146 recordings):

| Code                          | Teacher words | Flagged by muaalem (right) | Flagged by whisper (right) |
| ----------------------------- | ------------- | -------------------------- | -------------------------- |
| `ERR_TAJ_MADD_SHORT`          | 1             | 7 (0)                      | 0                          |
| `ERR_TAJ_GHONNA_OMIT` 🔶      | 21            | 0                          | 0                          |
| `ERR_PRON_MADD_ASLI_SHORT` 🔶 | 4             | 0                          | 0                          |
| `ERR_MEM_INSERTION` 🔶        | 0             | 0                          | 1 (0)                      |

Madd measurement is not shown to work: all 7 of muaalem's madd findings were wrong, and one true
madd word is too few to measure what it finds. Ghunna is common in the children's recitation but
no model produces the code (`quran-transcript` 0.6.4 does not tag it).

## 6. Speed and memory

| Step          | p50 s per ayah | p95 s per ayah |
| ------------- | -------------- | -------------- |
| Decode        | 0.03           | 0.03           |
| Gate          | 0.04           | 0.09           |
| quran-muaalem | 0.40           | 0.52           |
| whisper-quran | 0.61           | 0.88           |
| **Total**     | **1.07**       | **1.40**       |

Over HTTP (`POST /v1/recitation/analyze`, real models): p50 1.1 s, at most 2.3 s per ayah. Peak GPU
memory 1.59 GB for both recitation models. muaalem still runs: its findings go to the log line for
later evaluations.

## 7. What this does not show

- **One teacher.** Every label is one person's judgment, with no second labeller and no review
  round, so the numbers carry that teacher's labelling errors (B.6).
- **A small sample.** 17 children, 6 in dev and 11 in test. Many rates rest on fewer than 20
  recordings (in brackets above). A week 7 re-check needs more children, above all aged 6-8.
- **Test is easier than dev** (§3): fewer errors per child.
- **The targets are not approved.** The B.8 starting targets were used; Mohammad decides the real
  ones.
- **No device data.** `speakers.csv` has no `device` for any child, so the numbers cannot be split
  by phone or tablet.
- **The reference check cannot show the threshold.** The 25 reference recordings (one adult
  reciter) give the same output as `main` at all three levels, because none of their findings lies
  between 0.70 and 0.95.

## 8. Checks

- `pytest` in `services/ai`: 302 passed.
- `scripts/run_real_audio.py` on the 25 reference recordings, all 3 levels, `main` against this
  branch with timings removed: identical output.
- The real endpoint over HTTP, the same 25 recordings at 3 levels: 75 of 75 answers equal
  whisper-quran's decision alone; `model` is `whisper-quran`; every log line has `muaalemFindings`.

## 9. Open questions

| #   | Question                                                                                     | Who              | Needed by        |
| --- | -------------------------------------------------------------------------------------------- | ---------------- | ---------------- |
| 1   | The target numbers (B.8): is about 0.42 uncertain acceptable for the pilot?                  | Mohammad         | Before the pilot |
| 2   | More children, above all aged 6-8, and a second teacher on part of the set                   | Ismail + Qussai  | Week 7           |
| 3   | What the teacher's `poor_audio` recordings have in common, since the gate does not see it    | Ismail (teacher) | Week 5           |
| 4   | Pronunciation errors whisper-quran misses (0.20-0.30): use muaalem's findings for them again | Qussai           | Week 6           |
| 5   | Madd and ghunna: a set with many labelled words before either code can stop a child          | Ismail + Qussai  | Week 7           |
| 6   | A muaalem crash still fails the request although muaalem no longer decides                   | Qussai           | Week 5           |
