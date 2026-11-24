# ADR-0010: Whisper large-v3 for the Arabic words stage (OD-03)

- Status: Accepted (Qussai, AI lead, 2026-11-23). The licences in §5 wait for Mohammad's approval
  (OPS-009).
- Decides: OD-03, "Whisper model size for Arabic words (fits the GPU memory)", due in week 4.
- Context: In the Arabic track, the words stage shows a vowelled word, plays it, and the child
  reads it; local speech-to-text compares what was said with the expected word (FR-ARB-002). The
  architecture names faster-whisper with an open Whisper model, on our GPU machine, next to the two
  recitation models (AP-06, AP-12). No model text ever reaches a child (AP-11).
- Decisions:
  - **Model:** [`Systran/faster-whisper-large-v3`](https://huggingface.co/Systran/faster-whisper-large-v3)
    at revision `edaa852ec7e145841d8ffdb056a99866b5f0a478`, the CTranslate2 conversion of
    `openai/whisper-large-v3`. Run with `faster-whisper==1.2.1`, float16, on the GPU.
  - **Decoding:** Arabic, greedy (beam 1, temperature 0, no fallback), at most 10 new tokens, no
    timestamps, no faster-whisper VAD. A one-word clip cannot become a sentence.
  - **One CUDA version: 12.** CTranslate2 (inside faster-whisper) is built for CUDA 12, so torch
    moved from its CUDA 13 build to `2.14.1+cu126`. CTranslate2 then uses the CUDA 12 libraries
    torch brings, so torch must start the GPU before the model loads (`app/adapters/arabic_words.py`
    checks `torch.cuda.is_available()` first). Checked on 2026-11-23: the recitation models give
    the same results on the 25 reference recordings at all three levels as with CUDA 13, and
    large-v3 writes the same 97 transcripts. The same checks in the Linux image (`Dockerfile.gpu`,
    where torch brings the CUDA 12 libraries as `nvidia-*-cu12` packages) give the same results
    and transcripts too.
  - **The model never decides alone.** When nothing close to the expected word is heard, the
    answer is `uncertain` (record again, or the teacher checks), never `error` (§4).
- Code: `services/ai/scripts/benchmark_arabic_whisper.py` (the measurement). The words-stage
  endpoint `POST /v1/arabic/word` is week 5.

## 1. What was measured

On the GPU machine (RTX 3080, 12 GB), with the two recitation models already loaded, as on the pilot
machine. Test audio: all 97 words of the 25 reference ayat, cut from the reference recitation at
their word timings, each padded by at most 100 ms but never past half the gap to its neighbours.
**No child's recording was used.** Three ways to count a word as read:

- **exact:** the transcript is the word
- **contains:** the word is one of the words heard
- **close:** a heard word is at most one letter different (after normalising marks and letter
  forms, and writing a repeated letter once)

**False accept** checks each clip against a different word: a "yes" there is a child told they were
right when they read something else.

## 2. Results

Run of 2026-11-23 (`datasets/od03-2026-11-23-v3.json`, not in git).

|                                               | large-v3-turbo  | **large-v3**        |
| --------------------------------------------- | --------------- | ------------------- |
| GPU memory: the model alone                   | 1.97 GB         | 3.66 GB             |
| GPU memory: total, with the recitation models | 4.7 GB          | 6.6 GB of 12        |
| Seconds per word, p50 / p95                   | 0.13 / 0.20     | 0.22 / 0.28         |
| Correct: exact / contains / close             | 32% / 41% / 58% | 34% / 43% / **62%** |
| False accept, close                           | 2.1%            | **0%**              |
| A phrase of other words invented              | 11 of 97 clips  | **2 of 97**         |
| Clips under 1 s (18): correct, close          | 67%             | 72%                 |

A first run (2026-11-23, default decoding, 100 ms padding everywhere) also measured `small` (0.56
GB, 8% exact) and `medium` (1.84 GB, 23% exact). Both were behind in accuracy, so the second run
kept only the two candidates.

## 3. Why large-v3, not large-v3-turbo

- **Fewer made-up phrases.** On short clips Whisper sometimes writes phrases from its training
  data, such as "subscribe to the channel" or "thanks for watching". large-v3 did it on 2 clips,
  turbo on 11. A made-up phrase could become a wrong "error" or "accepted" for a child.
- **No false accepts.** large-v3 never matched a clip to a word that was not said; turbo did 2.1%
  of the time.
- **Speed and memory are enough.** 0.28 s per word at p95 is far below the 20 s limit (NFR-PERF),
  and all three models together use 6.6 of 12 GB.
- Turbo is faster and smaller. Neither matters at one word per request on one GPU.

## 4. What this does not show, and what follows for the words stage

- **Accuracy on children is unknown.** About 60% "correct" measures an adult reciter's flowing
  recitation cut into single words: held madd, sun letters that swallow ال, and words that run
  into each other. Children reading isolated vowelled Arabic-track words sound different. The
  comparison between sizes is fair (the same 97 clips); the absolute numbers are not the child
  accuracy.
- **About 40% of words came back not close to the expected word** (misheard, two letters off, or ال
  not heard). So the words stage must treat "nothing close heard" as `uncertain`, never as
  `error`: the child records again or the teacher checks (FR-QUR-006 applies the same rule to
  recitation). The model's text is never shown to the child (AP-11).
- **The matching rule is not decided.** The proposal for week 5 is "close" (at most one letter
  apart), which had 0% false accepts with large-v3. A leading ال is not ignored for now: a child
  who drops an ال that should be heard is not accepted.

## 5. Licences (listed in `docs/ai/model-register.md` v1.1)

Checked on 2026-11-23 at the model cards and in the package metadata.

| What                                                                       | Version         | Licence                 |
| -------------------------------------------------------------------------- | --------------- | ----------------------- |
| `Systran/faster-whisper-large-v3`                                          | `edaa852ec7e1…` | MIT (model card)        |
| `openai/whisper-large-v3` (converted from)                                 | —               | Apache-2.0 (model card) |
| `faster-whisper`                                                           | 1.2.1           | MIT                     |
| `ctranslate2`                                                              | 4.9.1           | MIT                     |
| `av` (PyAV)                                                                | 19.0.2          | BSD-3-Clause            |
| `onnxruntime` (faster-whisper dependency, not used: we do not use its VAD) | 1.32.0          | MIT                     |

No separate NVIDIA package is installed for the words stage: CTranslate2 uses the cuBLAS 12, cuDNN 9
and CUDA 12 runtime that torch's CUDA 12.6 build brings. Those are NVIDIA proprietary, not open
source (a first version of this ADR pinned them as separate `nvidia-*-cu12` packages). The rule
"everything is self-hosted and open source" (Roadmap §1) is about the models and services we run.
**Mohammad decides** whether NVIDIA's GPU runtime libraries are accepted as part of the driver
stack; the register lists them as open until he does.

## 6. Open questions

| #   | Question                                                                                                                              | Who                              | Needed by                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------- |
| 1   | Accuracy on children reading Arabic-track words: record a small set (a few children × the stage's words) and run the same measurement | Ismail + Qussai                  | Week 5                    |
| 2   | The matching rule: "close" (proposal), "contains", or another                                                                         | Qussai + Ismail, from question 1 | Week 5                    |
| 3   | The NVIDIA CUDA 12 libraries under "open source only" (§5)                                                                            | Mohammad                         | Before the pilot          |
| 4   | The revision pin in the words-stage adapter, refused if the folder holds another one, like the recitation models                      | Qussai                           | Week 5, with the endpoint |

## 7. How to measure again

On the GPU machine, Python 3.12, `pip install -r services/ai/requirements-dev.txt`:

```bash
cd services/ai
python scripts/benchmark_arabic_whisper.py --sizes large-v3-turbo large-v3
```

The results file keeps the transcripts of the reference reciter (never a child), so a change to
the scoring can be worked out again without the GPU.
