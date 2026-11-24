# ADR-0011: whisper-quran decides recitation, at a 0.95 confidence threshold (OD-02)

- Status: Accepted (Qussai, AI lead, 2026-11-24). The target numbers it was measured against are
  the B.8 starting targets and wait for Mohammad's approval.
- Decides: OD-02, "the main model and the first confidence threshold", due in week 4.
- Context: Two recitation models run on every ayah: `quran-muaalem` listens to sounds (letters,
  vowels, tajweed) and `whisper-quran` writes down words (skipped, different or extra words). Until
  week 4 the service merged their findings and a disagreement went to the teacher, with a
  provisional threshold of 0.70 (taxonomy, low confidence rule). A finding below the threshold
  makes the ayah `uncertain`: the child moves on and the teacher checks it (FR-QUR-006, VAL-006).
- Evidence: [the week 4 evaluation](../ai/week-4-evaluation.md), 17 children, one teacher.

## Decisions

- **Main model:** `whisper-quran` (`tarteel-ai/whisper-base-ar-quran@5c3c53fdf927`) alone decides
  `accepted`, `error` or `uncertain`. The result says `model: whisper-quran`.
- **quran-muaalem keeps running** and its findings go to the service's log line
  (`muaalemFindings`, codes and numbers only), so later evaluations keep their data. Its findings
  no longer reach the decision or the child. `app/combine.py` stays for the evaluation scripts.
- **Threshold:** `DEFAULT_THRESHOLD = 0.95` in `services/ai/app/policy.py`, still overridable with
  `CONFIDENCE_THRESHOLD`. Fixed in week 7 after a larger set (taxonomy, rule 1).

## Why

On the 6 dev children (146 recordings), swept from 0.50 to 0.99; no model met all three B.8
starting targets (false reject ≤ 0.05, false accept on memorization ≤ 0.15, uncertain ≤ 0.30).

| Option                 | False reject beg. / int. | FA memorization | Uncertain | Against it                                   |
| ---------------------- | ------------------------ | --------------- | --------- | -------------------------------------------- |
| **whisper-quran 0.95** | 0.059 / 0.045            | 0.0             | 0.42      | Misses uncertain; misses 20% of pron. errors |
| whisper-quran 0.99     | 0.037 / 0.018            | 0.0             | 0.45      | Near-certainty on every finding: overfitted  |
| combined 0.95          | 0.015 / 0.027            | 0.0             | 0.64      | Two ayat in three go to the teacher          |
| combined 0.70 (before) | 0.074 / 0.144            | 0.0             | 0.50      | Stops 1 child in 7 for nothing at int.       |

- whisper-quran at 0.95 is closest to all three targets, and 0.95-0.97 give the same numbers, so
  the choice is not on a knife edge.
- It never let a memorization error through, on dev or test. That is 0 of 16 recordings, which
  still fits a true rate up to 0.19 (95% range): not seen to fail, not shown to meet the target.
- The one test run (11 children, 272 recordings, frozen set) met all three starting targets:
  false reject 0.0075 / 0.0039, false accept on memorization 0.0, uncertain 0.28. Test had few
  errors (5 and 15 recordings), so the dev numbers are the better guide. The 95% ranges of every
  rate are in the report (§3, "How sure these numbers are").

## Consequences

- **Pronunciation errors are missed more often.** whisper-quran catches a wrong vowel or letter only
  when it changes the word: 0.20-0.30 of the recordings with a pronunciation error were accepted at
  intermediate. This was accepted for now; bringing back muaalem's pronunciation findings is week
  6 (report §9, question 4).
- **The teacher reviews about 4 ayat in 10**, and most ayat of the youngest children (0.53 on test,
  0.92 on the one dev child aged 6-8).
- **`ERR_TECH_MODELS_DISAGREE` no longer comes from the service**, only from the evaluation.
- **A muaalem crash still fails the request** (the API marks the ayah `uncertain`), although
  muaalem no longer decides (report §9, question 6).
- The 25-reference-recording check and the HTTP check give the same answers as before: their
  findings are either confidence 0.0 or always-uncertain codes.

## How to measure again

On the GPU machine, in `services/ai`, with the labelled dataset in `datasets/tibyan-eval`:

```bash
python scripts/run_models.py ../../datasets/tibyan-eval
python scripts/sweep_threshold.py ../../datasets/tibyan-eval
CONFIDENCE_THRESHOLD=0.95 python scripts/evaluate.py --split dev ../../datasets/tibyan-eval
```

The test split is evaluated once per decision, never to tune.
