# Tibyan Kids AI service

Owner: Qussai. A small FastAPI program that checks Quran recitation recordings. The API calls it
over HTTP; browsers never do. It is Python, so it is not part of the pnpm workspace or Turborepo.

- Result format: [`docs/contracts/ai-result.md`](../../docs/contracts/ai-result.md)
- Audio input and evaluation data: [`docs/ai/audio-io-and-eval-dataset.md`](../../docs/ai/audio-io-and-eval-dataset.md)
- Safety rules: [`docs/ai/genai_and_safety_boundaries.md`](../../docs/ai/genai_and_safety_boundaries.md)

## Where we are (week 4)

- With `MOCK_MODE=true` (the default) the endpoint returns **mock** results, so nobody needs a GPU
  to build features.
- With `MOCK_MODE=false` (the GPU machine) it runs the real pipeline (`app/pipeline.py`): quality
  gate, both models, merged findings with word segments, one decision. It runs the same way in
  Docker (`Dockerfile.gpu`).
- The API sends each recorded ayah here and saves the result (`apps/api`,
  `POST /api/v1/children/:id/recitation-attempts`).
- Week 4 evaluation, on the 17 children's recordings in `datasets/tibyan-eval` (ignored by git and
  Docker):
  1. `scripts/prepare_dataset.py`: `layout`, `split`, `import-labels` (again as the teacher labels
     more), then `freeze`.
  2. `scripts/run_models.py`: the gate and both models once on every recording; what they found is
     saved (`app/saved_outputs.py`).
  3. `scripts/evaluate.py` and `scripts/sweep_threshold.py`: the numbers and the threshold sweep on
     the dev split, from the saved outputs, without loading a model. Then the main model and the
     first threshold (OD-02).
- The Arabic words stage (FR-ARB-002) will use Whisper large-v3 (ADR-0010, OD-03). Its adapter
  (`app/adapters/arabic_words.py`) pins and loads the model; the word check endpoint is week 5.

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
    MERGE                        app/combine.py  combine_findings()
    at most one finding per word; whisper says "wrong word" but muaalem heard it fine
    ──► ERR_TECH_MODELS_DISAGREE (the teacher checks it)
    then each finding gets its word's segment of the reference audio, to replay
                                 app/reference.py  add_word_segments()
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

`app/pipeline.py` runs these steps for the endpoint, one request at a time (the gate and both models
share one GPU; `MODELS_LOCK`). It writes one JSON log line per request: numbers and codes only.
Each adapter's `find_errors()` returns its findings and decides nothing; `decide()` makes the one
decision. Every module imports its packages at the top, so the model packages (torch, transformers,
silero-vad, faster-whisper) are installed everywhere, including CI and the laptop image; no model is loaded there.

### Where to start reading

1. `app/schemas.py`: what a result and a finding look like.
2. `app/policy.py`: how findings become a decision. Short, and the core rules of the product.
3. `app/mock.py`: the same rules with fake findings. Good for seeing a whole result.
4. `app/audio.py`: decoding and the quality gate.
5. `app/adapters/whisper_quran.py`, then `app/adapters/muaalem.py`: the models.
6. `app/combine.py`: how the two models' findings become one list.
7. `app/pipeline.py`: everything together, as the endpoint runs it.

### File map

| File                                                   | What it does                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `app/main.py`                                          | The HTTP endpoints (`/health`, `/v1/recitation/analyze`): mock or real, and the error answers    |
| `app/pipeline.py`                                      | The real check: decode, gate, both models, merge, word segments, decision, one log line          |
| `app/combine.py`                                       | Merges the two models' findings (one per word; models disagree → teacher)                        |
| `app/schemas.py`                                       | The result format (Pydantic), kept in line with the contract's JSON Schema                       |
| `app/policy.py`                                        | Error codes → category and child message; findings → decision for a level                        |
| `app/mock.py`                                          | Fake but rule-following results for `MOCK_MODE` (real word segments), so nobody needs a GPU      |
| `app/audio.py`                                         | Decoding (ffmpeg) and the quality gate (Silero VAD, loudness, signal-to-noise)                   |
| `app/reference.py`                                     | The text and word timings of the 25 prototype ayat (`packages/contracts/data`)                   |
| `app/model_files.py`                                   | Where the model files are loaded from (`services/ai/models/` or the cache)                       |
| `app/adapters/muaalem.py`                              | quran-muaalem: sounds and tajweed → findings                                                     |
| `app/adapters/whisper_quran.py`                        | whisper-quran: transcript → word comparison → findings                                           |
| `app/adapters/arabic_words.py`                         | Whisper large-v3 for the Arabic words stage: the pinned model, loaded on the GPU (ADR-0010)      |
| `app/saved_outputs.py`                                 | The models' saved output per recording, and the decisions worked out again from it (no GPU)      |
| `scripts/run_real_audio.py`                            | Runs the gate and both models on a folder of recordings (GPU machine)                            |
| `scripts/download_models.py`                           | Puts the pinned model files into `services/ai/models/` (GPU machine)                             |
| `app/evaluation.py`                                    | Evaluation numbers: gold labels, false reject / accept, word location, gate, latency (no models) |
| `scripts/prepare_dataset.py`                           | The children's recordings into the evaluation layout: layout, split, import-labels, freeze       |
| `scripts/run_models.py`                                | The gate and both models once on every recording of the dataset; saves what they found (GPU)     |
| `scripts/evaluate.py`                                  | One evaluation run from the saved outputs (no GPU). Writes `runs/*.json`                         |
| `scripts/sweep_threshold.py`                           | The confidence threshold sweep on the dev split, from the saved outputs (OD-02)                  |
| `scripts/benchmark_arabic_whisper.py`                  | OD-03: faster-whisper sizes for the Arabic words stage, on words of the reference recitation     |
| `scripts/align_word_timings.py`                        | Proposes word timings for the reference recitation (GPU machine)                                 |
| `tests/test_contract.py`                               | The service and the mock follow the contract's JSON Schema and message list                      |
| `tests/test_policy.py`                                 | The decision rules                                                                               |
| `tests/test_quality_gate.py`                           | The quality gate, with generated audio                                                           |
| `tests/test_whisper_words.py`                          | whisper-quran's word logic: spelling, word comparison, token grouping                            |
| `tests/test_whisper_model.py`                          | whisper-quran's model side with a fake transcript: `find_errors()`, the output cap, loading      |
| `tests/test_muaalem_codes.py`                          | How quran-muaalem's errors become our codes, with errors built by hand                           |
| `tests/test_evaluation.py`                             | The evaluation numbers, on synthetic labels with values worked out by hand                       |
| `tests/test_prepare_dataset.py`                        | The dataset steps on synthetic folders (fake audio, never a recording)                           |
| `tests/test_saved_outputs.py`                          | Saved outputs, the model run with fake models, and evaluate.py end to end                        |
| `tests/test_sweep_threshold.py`                        | The threshold sweep and `decide()`'s threshold argument                                          |
| `tests/test_benchmark_arabic_whisper.py`               | The OD-03 benchmark's cutting, comparing and scoring, with a fake model                          |
| `tests/test_arabic_words.py`                           | Where the Arabic words model is loaded from, and the revision check                              |
| `tests/test_main.py`, `tests/test_pipeline.py`         | The endpoints and the real pipeline, with fake models (no GPU)                                   |
| `tests/test_combine.py`                                | Merging the two models' findings                                                                 |
| `tests/test_reference.py`, `tests/test_model_files.py` | Loading the reference text and the model files                                                   |

CI runs every test without a GPU: the model packages are installed, but no model is loaded. Changes to the model code are
also checked on the GPU machine with `scripts/run_real_audio.py` on the 25 reference recordings
(each model alone and combined), and changes to the endpoint by sending the same recordings to it
over HTTP.

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

### Why the code is this way

The code has one short note per file and per function. The reasons behind its values and rules are
here.

| Code                                                                 | Why                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `audio.py` `MAX_SPEECH_SECONDS = 30`                                 | Whisper's input window. A longer reading would look like skipped words                                                               |
| `audio.py` `VAD_THRESHOLD = 0.2`                                     | Silero's default 0.5 misses long madd and ghunna sounds                                                                              |
| `audio.py` `MIN_SNR_DB = 10`                                         | At 15 dB the gate rejected 6 children's recordings the teacher judged fine (7.7-14.4 dB) and caught none of the 6 poor ones          |
| `audio.py` `FRAME_SAMPLES = 320`, `CLIPPED_LEVEL = 0.976`            | 20 ms frames for the signal-to-noise ratio; 0.976 is 32000 / 32768                                                                   |
| `audio.py` `PADDING_AFTER_SECONDS = 3.0`                             | Silero VAD stops hearing a long final madd early (1:4)                                                                               |
| `audio.py` `decode_audio()`, ffmpeg `-t`                             | A tiny file can hold a very long recording, so only a little over the limit is decoded                                               |
| `pipeline.py` `MODELS_LOCK`                                          | One recording at a time, the gate included: two requests at once corrupted Silero VAD and crashed the service                        |
| `pipeline.py` advanced level                                         | No targeted tajweed rules per lesson yet (taxonomy §2.1), so advanced stops like intermediate                                        |
| `main.py` `analyze_recitation()` is not `async`                      | FastAPI runs it in a thread, so `/health` answers while a request waits for the GPU                                                  |
| `main.py` `MAX_AUDIO_BYTES`                                          | The same 5 MB limit as the API (VAL-016)                                                                                             |
| `policy.py` `DEFAULT_THRESHOLD = 0.70`                               | Provisional until the week 4 benchmark (OD-02)                                                                                       |
| `policy.py` `STOPS["advanced"]`                                      | Advanced also stops on the tajweed rules targeted in the lesson (`targeted_tajweed_codes`)                                           |
| `policy.py` `NOT_YET_APPROVED` has `ERR_TAJ_MADD_SHORT`              | Week 4 dev: quran-muaalem flagged 7 madd words, all wrong, against 1 the teacher marked; a reminder only                             |
| `combine.py` `CODES_MUAALEM_SHOULD_HEAR`                             | A skipped or different word changes the sounds, so muaalem should hear it too; if it did not, the models disagree                    |
| `evaluation.py` `GUARD`                                              | Unreadable audio and `too_long` are not quality results, so they are left out of the gate's precision and recall                     |
| `whisper_quran.py` `MAX_NEW_TOKENS = 200`                            | The longest prototype ayah is 75 tokens; past 448 positions the GPU crashes, and noisy audio can loop until then                     |
| `whisper_quran.py` `MARKS`                                           | Harakat, tanween, the dagger alif, Quranic marks and tatweel are dropped before words are compared                                   |
| `whisper_quran.py` `use_safetensors=False`                           | Otherwise transformers fetches a converted copy that is not part of the pin                                                          |
| `whisper_quran.py` `transcribe()`                                    | Special tokens are left out of a word's confidence: they are forced or always certain, so every word would look surer                |
| `muaalem.py` `error_code()`                                          | The ghunna check comes before the madd check, because `MoshaddadOrModghamNoonRule` (ghunna) is a subclass of `MaddRule`              |
| The three `*_REVISION` pins                                          | Change a pin only together with an evaluation run (recitation) or a new measurement (Arabic words, ADR-0010)                         |
| `arabic_words.py` `load_model()`                                     | torch must start the GPU first: faster-whisper's engine (CTranslate2) uses the CUDA 12 libraries torch loads                         |
| `arabic_words.py` `model_folder()`, `download_models.py`             | No Hugging Face cache: it needs symbolic links, which Windows refuses without Developer Mode                                         |
| `download_models.py` `.partial` folder                               | A model is moved into place only when complete, so a broken download never looks like a valid copy                                   |
| `align_word_timings.py` `PAUSE_FRAMES`, `KEEP_FRAMES`, `BACK_FRAMES` | About 400, 120 and 40 ms. Chosen by asking whisper-quran to recognise each cut-out word: 51 of 97, against 18 before                 |
| `align_word_timings.py` `BLANK = 0`                                  | The CTC blank (`[PAD]`) of quran-muaalem's phoneme level                                                                             |
| `run_models.py` runs on test recordings too                          | Running a model is not tuning; only the final `evaluate.py --split test` run looks at test numbers (B.7)                             |
| `run_models.py` a second run with the same name                      | Continues where the first stopped, and refuses other model versions, so one run folder is always one set of models                   |
| `run_models.py` `run_gate()`                                         | The VAD is the slow part, so it runs once and both the gate and its measurements get its answer                                      |
| `run_models.py` a rejected recording                                 | Never reaches the models, as in the service                                                                                          |
| `saved_outputs.py`                                                   | A saved output holds numbers and codes only, but it belongs to a child's recording, so it stays in the dataset folder                |
| `prepare_dataset.py` `band_counts`                                   | Every age band gets the same test and dev share, so dev always has young children to tune on (ties: youngest)                        |
| `prepare_dataset.py` labels stored as round 1                        | One teacher labels every word, so each label is final (B.6 format)                                                                   |
| `prepare_dataset.py` `layout`                                        | Nothing is copied until every file is named right                                                                                    |
| `benchmark_arabic_whisper.py` `MAX_NEW_TOKENS = 10`                  | One Arabic word is a few tokens; more than this is a sentence that is not there                                                      |
| `benchmark_arabic_whisper.py` `SHORT_CLIP_SECONDS = 1.0`             | Invented phrases happen mostly below this, so short clips are scored apart                                                           |
| `benchmark_arabic_whisper.py` results and transcripts                | Saved after every size, so a later failure never loses a measured size; transcripts (reference reciter only) are kept to score again |

## Run the mock service

With Docker Compose from the repo root (MongoDB and this service on `127.0.0.1:8000`, the API's
default `AI_SERVICE_URL`):

```bash
docker compose up -d --wait
```

Or with Python 3.12 (installs the model packages too, about 3 GB):

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

Needs an NVIDIA GPU, Python 3.12 and ffmpeg on `PATH`. Use 3.12, as CI and Docker do: a newer
Python can miss packages (faster-whisper needs onnxruntime, which has no Python 3.15 build yet).
The whole service runs on CUDA 12: torch is the CUDA 12.6 build, and faster-whisper's engine
(CTranslate2) uses the CUDA libraries torch brings, so torch must start the GPU before
faster-whisper runs (`app/adapters/arabic_words.py` does that).

```bash
cd services/ai
pip install -r requirements-dev.txt   # includes requirements-gpu.txt (torch for CUDA 12.6)
python scripts/download_models.py   # the models, at the pinned revisions, into services/ai/models/
python scripts/run_real_audio.py <folder with the recordings> <beginner|intermediate|advanced>
python scripts/benchmark_arabic_whisper.py   # OD-03: faster-whisper sizes for the Arabic words stage
```

The folder holds one mp3 per ayah, named `SSSAAA.mp3` (surah and ayah, 3 digits each), for example
`001001.mp3` for Al-Fatiha 1. Only the 25 prototype ayat are checked. **Recordings are never
copied into this repository** (it is public).

For each file the script prints the gate result, the decision and findings of each model alone
with its seconds, then of both models combined (with the word segments), and at the end the GPU
memory used.

### The real service in Docker

`Dockerfile.gpu` is the AI service with the real models (Python 3.12, torch 2.14.1 for CUDA 12.6,
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
| `ARABIC_WORDS_REVISION`  | `edaa852e…`          | Exact Hugging Face commit of `Systran/faster-whisper-large-v3` (full 40 characters). Change only with a new measurement (ADR-0010)         |

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
| Systran/faster-whisper-large-v3  | Arabic words stage (ADR-0010)         | MIT (from OpenAI's, Apache-2.0)      |
| Silero VAD                       | Speech vs silence in the quality gate | MIT                                  |
| ffmpeg                           | Decoding uploads                      | LGPL/GPL (run as a separate program) |

Full register with versions, model revisions, data sources and the recordings' checksums:
[`docs/ai/model-register.md`](../../docs/ai/model-register.md).

QML 1.0 conditions (AI notice before first use, use according to Islamic law, no ad tracking, fix
a violation within 30 days): see `docs/ai/genai_and_safety_boundaries.md` section 3.
