# Noor AI service

Owner: Qussai. A small FastAPI program that checks Quran recitation recordings. The API calls it
over HTTP; browsers never do. It is Python, so it is not part of the pnpm workspace or Turborepo.

- Result format: [`docs/contracts/ai-result.md`](../../docs/contracts/ai-result.md)
- Audio input and evaluation data: [`docs/ai/audio-io-and-eval-dataset.md`](../../docs/ai/audio-io-and-eval-dataset.md)
- Safety rules: [`docs/ai/genai_and_safety_boundaries.md`](../../docs/ai/genai_and_safety_boundaries.md)

## Where we are (week 3)

- With `MOCK_MODE=true` (the default) the endpoint returns **mock** results, so nobody needs a GPU
  to build features.
- With `MOCK_MODE=false` (the GPU machine) it runs the real pipeline (`app/pipeline.py`): quality
  gate, both models, merged findings with word segments, one decision.

## How it works

One request checks **one recorded ayah**. The recording goes through four steps:

```text
 audio upload (webm, mp4, ogg, wav or mp3; at most 5 MB)
      │
      ▼
 1. DECODE                       app/audio.py  decode_audio()
    ffmpeg turns any format into 16 kHz mono samples (numbers between -1 and 1)
      │
      ▼
 2. QUALITY GATE                 app/audio.py  check_quality()
    Is there speech? Is it loud and clear enough? Is the reading under 30 s?
    no  ──► result with quality = silent / too_short / too_noisy / too_long
            (decision "uncertain", no findings; the child records again, not an attempt)
    yes ──► the "clip": the reading itself, without the silence around it
      │
      ▼
 3. TWO MODELS, each looks for a different kind of mistake
    ┌─────────────────────────────────────┬─────────────────────────────────────┐
    │ app/adapters/muaalem.py             │ app/adapters/whisper_quran.py       │
    │ quran-muaalem: listens to SOUNDS    │ whisper-quran: writes down WORDS    │
    │ wrong letter, wrong vowel, tajweed  │ skipped, different or extra words   │
    │ compares with the Uthmani text      │ compares with the Imlaei words      │
    └─────────────────┬───────────────────┴──────────────────┬──────────────────┘
                      └──────────► findings ◄────────────────┘
          one finding = a word number + an error code + the model's confidence (0-1)
      │
      ▼
 4. DECISION                     app/policy.py  decide()
    any finding below the confidence threshold  ──► "uncertain" (a teacher checks it)
    a finding that stops the child's level      ──► "error"     (the child reads again)
    otherwise                                   ──► "accepted"  (other findings kept as notes)
      │
      ▼
 RESULT                          app/schemas.py  AnalysisResult
 the format the API receives: docs/contracts/ai-result.md
```

**Today (week 3):** the HTTP endpoint (`app/main.py`) still returns **mock** results. The real steps
1–4 run from `scripts/run_real_audio.py`. Each adapter has two functions: `find_errors()` returns its
findings and decides nothing, and `analyze()` adds the decision for that model alone. Merging the
two models' findings into one result, deciding once, and connecting it to the endpoint is the
week-3 work.

### Where to start reading

1. `app/schemas.py`: what a result and a finding look like.
2. `app/policy.py`: how findings become a decision. Short, and the core rules of the product.
3. `app/mock.py`: the same rules with fake findings. Good for seeing a whole result.
4. `app/audio.py`: decoding and the quality gate.
5. `app/adapters/whisper_quran.py`, then `app/adapters/muaalem.py`: the models.
6. `scripts/run_real_audio.py`: everything together on real recordings.

### File map

| File                                                   | What it does                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `app/main.py`                                          | The HTTP endpoints (`/health`, `/v1/recitation/analyze`). Mock only for now                         |
| `app/schemas.py`                                       | The result format (Pydantic), kept in line with the contract's JSON Schema                          |
| `app/policy.py`                                        | Error codes → category and child message; findings → decision for a level                           |
| `app/mock.py`                                          | Fake but rule-following results for `MOCK_MODE`, so nobody needs a GPU                              |
| `app/audio.py`                                         | Decoding (ffmpeg) and the quality gate (Silero VAD, loudness, signal-to-noise)                      |
| `app/reference.py`                                     | The text of the 25 prototype ayat (`packages/contracts/data`)                                       |
| `app/model_files.py`                                   | Where the model files are loaded from (`services/ai/models/` or the cache)                          |
| `app/adapters/muaalem.py`                              | quran-muaalem: sounds and tajweed → findings                                                        |
| `app/adapters/whisper_quran.py`                        | whisper-quran: transcript → word comparison → findings                                              |
| `scripts/run_real_audio.py`                            | Runs the gate and both models on a folder of recordings (GPU machine)                               |
| `scripts/download_models.py`                           | Puts the pinned model files into `services/ai/models/` (GPU machine)                                |
| `app/evaluation.py`                                    | Evaluation numbers: gold labels, false reject / accept, word location, gate, latency (no models)    |
| `scripts/evaluate.py`                                  | One evaluation run on a labelled dataset (GPU machine). Writes `runs/*.json`                        |
| `scripts/make_reference_dataset.py`                    | A smoke-test dataset from the 25 reference recordings, written outside the repository               |
| `scripts/align_word_timings.py`                        | Proposes word timings for the reference recitation (GPU machine)                                    |
| `tests/test_contract.py`                               | The service and the mock follow the contract's JSON Schema and message list                         |
| `tests/test_policy.py`                                 | The decision rules                                                                                  |
| `tests/test_quality_gate.py`                           | The quality gate, with generated audio                                                              |
| `tests/test_whisper_words.py`                          | whisper-quran's word logic: spelling, word comparison, token grouping                               |
| `tests/test_whisper_model.py`                          | whisper-quran's model side with a fake model: `find_errors()`, `analyze()`, the output cap, loading |
| `tests/test_muaalem_codes.py`                          | How quran-muaalem's errors become our codes (GPU machine only, skipped in CI)                       |
| `tests/test_evaluation.py`                             | The evaluation numbers, on synthetic labels with values worked out by hand                          |
| `tests/test_reference.py`, `tests/test_model_files.py` | Loading the reference text and the model files                                                      |

CI runs every test without a GPU: the models are faked or not needed. Changes to the model code are
also checked on the GPU machine with `scripts/run_real_audio.py` on the 25 reference recordings.

### Words you will meet in the code

| Word                    | Meaning                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ayah (plural ayat)      | One verse of the Quran. The prototype uses 25 ayat from 5 short surahs (chapters)                                                                                            |
| Uthmani / Imlaei        | Two ways of writing the same Quran text: Uthmani is the script of the printed Quran; Imlaei is ordinary modern spelling                                                      |
| tajweed                 | The rules of correct Quran recitation, for example **madd** (holding a vowel longer), **ghunna** (a nasal sound on n and m) and **qalqala** (a small bounce on some letters) |
| haraka (plural harakat) | A short vowel mark (a, i, u) on a letter                                                                                                                                     |
| finding                 | One problem in one word: word number, error code, confidence. Defined in `schemas.py`                                                                                        |
| decision                | `accepted`, `error` or `uncertain` for the whole ayah. Made by `policy.py`                                                                                                   |
| level                   | `beginner`, `intermediate` or `advanced`: decides which kinds of error stop the child                                                                                        |
| confidence threshold    | Below it (0.70 for now) a finding is not trusted and a teacher checks the ayah                                                                                               |
| reference recitation    | A correct recording of each ayah by an adult reciter, used for word replay and checks                                                                                        |
| phoneme                 | One speech sound. quran-muaalem predicts the phonemes it hears                                                                                                               |
| CTC                     | How quran-muaalem outputs sounds: one prediction every ~40 ms, which can also be lined up with a known text                                                                  |
| VAD                     | Voice activity detection: finds where speech is. We use Silero VAD                                                                                                           |
| SNR                     | Signal-to-noise ratio: how much louder the voice is than the background, in dB                                                                                               |
| clip                    | The part of the recording the models get: the reading, without the silence before and after it                                                                               |
| mock mode               | `MOCK_MODE=true`: fake results, no models, no GPU. The default on laptops                                                                                                    |
| pinned revision         | The exact version of a model, so results never change without us choosing to                                                                                                 |

## Run the mock service

With Docker Compose from the repo root (MongoDB and this service on `127.0.0.1:8000`, the API's
default `AI_SERVICE_URL`):

```bash
docker compose up -d --wait
```

Or with Python 3.11+:

```bash
cd services/ai
python -m venv .venv
# Windows:   .venv\Scripts\activate
# Mac/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Then open http://localhost:8000/health or http://localhost:8000/docs.

## Run the real models (GPU machine)

Needs an NVIDIA GPU, Python 3.12 and ffmpeg on `PATH`.

```bash
cd services/ai
pip install -r requirements-dev.txt
pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cu130
pip install -r requirements-gpu.txt
python scripts/download_models.py   # the models, at the pinned revisions, into services/ai/models/
python scripts/run_real_audio.py <folder with the recordings> <beginner|intermediate|advanced>
```

The folder holds one mp3 per ayah, named `SSSAAA.mp3` (surah and ayah, 3 digits each), for example
`001001.mp3` for Al-Fatiha 1. Only the 25 prototype ayat are checked. **Recordings are never
copied into this repository** (it is public).

For each file the script prints the gate result, the result of each model in the contract format,
the seconds per model and the GPU memory used.

### The real service in Docker

`Dockerfile.gpu` is the AI service with the real models (Python 3.12, torch 2.14.1 for CUDA 13,
ffmpeg). It needs the NVIDIA driver and container toolkit (Docker Desktop on Windows: WSL 2), and
`services/ai/models/` filled by `scripts/download_models.py`. From the repository root:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build ai
```

- The models are mounted read-only from `services/ai/models/`, never copied into the image.
- The container never downloads anything (`HF_HUB_OFFLINE=1`): without the models it stops at
  startup.
- **Never push this image or give it to anyone:** it contains Debian's ffmpeg, which is GPL
  (`docs/ai/model-register.md`, section 2).

## Run the test

```bash
cd services/ai
pytest
```

`tests/test_contract.py` checks the service against
`packages/contracts/schemas/recitation_result.schema.json` and `safe_messages_v1_1.json`, so run it
from inside the repository.

## Settings

| Variable                 | Default              | Meaning                                                                                                                                    |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `MOCK_MODE`              | `true`               | Fake results from the endpoint. `false` loads the real models at startup (`false` in `Dockerfile.gpu`)                                     |
| `CONFIDENCE_THRESHOLD`   | `0.70`               | Below this a finding makes the ayah `uncertain`. Provisional until week 4 (OD-02)                                                          |
| `REFERENCE_DATA_DIR`     | repo                 | Folder with `reference_quran_text.json`. The repo's `packages/contracts/data` when unset; `/data/reference` in Docker (mounted by Compose) |
| `MODELS_DIR`             | `services/ai/models` | Local model files (not in git), filled by `scripts/download_models.py`. Without them the Hugging Face cache is used                        |
| `MUAALEM_REVISION`       | `01a1ef9f…`          | Exact Hugging Face commit of `obadx/muaalem-model-v3_2` (full 40 characters). Change only with an evaluation run                           |
| `WHISPER_QURAN_REVISION` | `5c3c53fd…`          | Exact Hugging Face commit of `tarteel-ai/whisper-base-ar-quran` (full 40 characters). Change only with an evaluation run                   |

## What the mock returns

| Input                          | Result                                                   |
| ------------------------------ | -------------------------------------------------------- |
| audio smaller than 1 KB        | `quality: "too_short"` (not an attempt)                  |
| ayah divisible by 5 (5, 10, …) | word 1 skipped, confidence 0.4 → `uncertain`             |
| ayah divisible by 3 (3, 6, 9)  | word 1 read as a different word → `error` at every level |
| any other ayah                 | `accepted`                                               |

## Models and licences

| Component                        | Use                                   | Licence                              |
| -------------------------------- | ------------------------------------- | ------------------------------------ |
| quran-muaalem (obadx)            | Pronunciation and tajweed errors      | **QML 1.0**                          |
| tarteel-ai/whisper-base-ar-quran | Word-level transcript                 | Apache-2.0                           |
| Silero VAD                       | Speech vs silence in the quality gate | MIT                                  |
| ffmpeg                           | Decoding uploads                      | LGPL/GPL (run as a separate program) |

Full register with versions, model revisions, data sources and the recordings' checksums:
[`docs/ai/model-register.md`](../../docs/ai/model-register.md).

QML 1.0 conditions (AI notice before first use, use according to Islamic law, no ad tracking, fix
a violation within 30 days): see `docs/ai/genai_and_safety_boundaries.md` section 3.
