# AI model and data licence register (OPS-009)

- Owners: Ismail (AI 2) + Qussai (AI 1). Approves licences: Mohammad.
- Version: v1.0, 2026-11-15.
- Requirement: OPS-009 "Register of every open-source model and its licence". Also AP-06 (no
  runtime call to an outside service: everything below runs on our machines).
- Related: `docs/ai/genai_and_safety_boundaries.md` §3 (QML 1.0 conditions and the AI notice).

Every model, library, data file and recording on the recitation path, with the licence checked at
its source on 2026-11-15: package metadata for libraries, the Hugging Face model or dataset card for
models, and the notice shipped with the data. **A change of version, revision or source updates
this file in the same pull request.**

## 1. Models

| Model                                                                                         | Revision (pinned)                          | Licence    | Built from                                                                   | Used for                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| [`obadx/muaalem-model-v3_2`](https://huggingface.co/obadx/muaalem-model-v3_2)                 | `01a1ef9fbe40d144ef845101e89ff924aed3fef5` | MIT        | `facebook/w2v-bert-2.0` (MIT), trained on `obadx/muaalem-annotated-v3` (MIT) | Pronunciation and tajweed errors; word timings |
| [`tarteel-ai/whisper-base-ar-quran`](https://huggingface.co/tarteel-ai/whisper-base-ar-quran) | `5c3c53fdf9272c4f6ee0bee09a1e5a4a615ee25c` | Apache-2.0 | `openai/whisper-base` (Apache-2.0 on its model card)                         | Word-level transcript (memorization errors)    |
| Silero VAD (bundled in the `silero-vad` package)                                              | package 6.2.3                              | MIT        | —                                                                            | Speech vs silence in the quality gate          |

The revisions are pinned in the adapters (`MUAALEM_REVISION`, `WHISPER_QURAN_REVISION`) and sent
in `modelVersion` with every result (OPS-008). Changing one needs an evaluation run on the
untouched test set (AI release rules).

On the GPU machine the model files live in `services/ai/models/` (not in git), filled at these
revisions by `services/ai/scripts/download_models.py`; each folder records its revision and a
folder holding another one is refused.

## 2. Libraries on the recitation path

| Package            | Version                            | Licence (package metadata)                                                                          | Notes                                                                 |
| ------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `quran-muaalem`    | 0.3.0                              | **QML 1.0** (`LicenseRef-QML-1.0`)                                                                  | The inference code. Its conditions bind the app: see §5               |
| `quran-transcript` | 0.6.4                              | MIT                                                                                                 | Phonetizer and error explainer. Ships Tanzil text (CC BY 3.0, see §3) |
| `transformers`     | 4.57.6                             | Apache-2.0                                                                                          | Pinned below 5: quran-muaalem does not work with transformers 5       |
| `torch`            | 2.14.1+cu130                       | Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND MIT | CUDA build for the GPU machine                                        |
| `huggingface-hub`  | 0.36.2                             | Apache-2.0                                                                                          | Downloads the pinned model files                                      |
| `numpy`            | 2.5.4                              | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0                                                  |                                                                       |
| `silero-vad`       | 6.2.3                              | MIT                                                                                                 | Includes the VAD model (§1)                                           |
| `fastapi`          | 0.162.5                            | MIT                                                                                                 | The AI service                                                        |
| `uvicorn`          | 0.54.0                             | BSD-3-Clause                                                                                        |                                                                       |
| `pydantic`         | 2.14.3                             | MIT                                                                                                 | The result contract                                                   |
| `python-multipart` | 0.0.33                             | Apache-2.0                                                                                          | Audio uploads                                                         |
| **ffmpeg**         | 9.0.2 (GPU machine)                | **GPL v3** for this build (`--enable-gpl --enable-version3`, gyan.dev full build)                   | Run as a separate program, never linked into our code (see below)     |
| **ffmpeg**         | 7.1.5-0+deb13u1 (`Dockerfile.gpu`) | **GPL v2+** for this build (`--enable-gpl`, Debian 13 package)                                      | The real-model Docker image. **Never distributed** (see below)        |

**ffmpeg.** Running a GPL program as a separate process on our own machine creates no obligation
for our code. If we ever give someone a copy (for example a Docker image with ffmpeg inside), the
GPL applies to that copy: either offer its source, or use an LGPL build that has no GPL parts. The
laptop Docker image (`Dockerfile`) has no ffmpeg (mock mode decodes no audio). The real-model image (`Dockerfile.gpu`) contains
Debian's GPL build above: it is built and run on our own GPU machine only, and is **never pushed to a
registry or given to anyone**. If that ever has to change, switch it to an LGPL build first.
On the 25 reference recordings, the image (ffmpeg 7.1.5) gives the same decisions, findings and word
segments as the GPU machine (ffmpeg 9.0.2).

Versions are those installed on the GPU machine on 2026-11-15. The dependency audit in CI covers
known vulnerabilities; this table covers licences.

## 3. Quran text

| File / field                                                       | Source                                                               | Licence                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `reference_quran_text.json`: `text_uthmani` and each word's `text` | Tanzil Quran Text, Uthmani, version 1.1                              | Creative Commons Attribution 3.0, plus Tanzil's terms below |
| `reference_quran_text.json`: each word's `text_imlaei`             | Tanzil Imlaei text, through the word map in `quran-transcript` 0.6.4 | Same                                                        |

Tanzil's terms (quoted from the notice shipped in `quran-transcript`):

> Permission is granted to copy and distribute verbatim copies of this text, but CHANGING IT IS NOT
> ALLOWED. This Quran text can be used in any website or application, provided that its source
> (Tanzil Project) is clearly indicated, and a link is made to tanzil.net to enable users to keep
> track of changes. This copyright notice shall be included in all verbatim copies of the text, and
> shall be reproduced appropriately in all files derived from or containing substantial portion of
> this text.

🔶 **Open (Ismail):** `text_uthmani` matches Tanzil Uthmani 1.1 exactly in 18 of 25 ayat. In the
other 7 (1:1, 1:2, 1:3, 1:4, 108:1, 113:4, 114:3) the tatweel (ـ) is removed. Either confirm this
is a variant Tanzil itself provides, or restore Tanzil's exact text. The models' processing of the
text (normalising for comparison) is internal and is not a change to the text shown.

## 4. Reference recitation and timings

| Item                                | Source                                                                                                                                                                         | Licence / status                                                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference recitation of the 25 ayat | Sheikh Mahmoud Khalil Al-Husary, verse-by-verse mp3 files from VerseByVerseQuran.com / EveryAyah (tags: `artist=Al Husary`, `album=VerseByVerseQuran.Com`, split with mp3splt) | 🔶 **Use assumed permitted, written confirmation pending** (L0). Neither site states a licence (checked 2026-11-15). Until confirmed: internal development and measurement only, not played to families |
| `reference_word_timings.json`       | Noor (forced alignment with `scripts/align_word_timings.py`, reviewed by ear)                                                                                                  | Noor's own data                                                                                                                                                                                         |
| `safe_messages_v1_1.json`           | Noor (Ismail)                                                                                                                                                                  | Noor's own text                                                                                                                                                                                         |

The recordings are never in the repository (it is public). They are identified by their SHA-256,
so anyone can check that `datasets/reference-recitation/` holds the registered files:

```text
001001.mp3  a32088d34381989c1eae4e927d9d1d569e6dcc4f35d29eee414c6d12d2f32a1f
001002.mp3  00b03509a19a3fe5769b02392889f469fa1222cd11531bbeff2724ca5dede7c9
001003.mp3  8ba76685c4dcb728ce3c03130c3c028f2ff69127608a57dde858d20a13b6b75b
001004.mp3  c7c9e46d06d8ec9e6e1937fc2b0762bf1d0a67079f7b4cafdb43c88250daf55b
001005.mp3  c576f1943f9624924329d82577dad75c5f22e147464cefe0c697dfb2538964d5
001006.mp3  5bfdaf77dcbd6dff029e379ccef63e74fe0115a1f5f41710b33f22b507afbcc2
001007.mp3  83c01a366e877db3bc67b77d4a451bd3f162a5e64fda8cad80be64dae11d68cb
108001.mp3  31ea3a14454d60775e7324a6eb92814e0eac282e31f6f29d1e3a2a62aec88261
108002.mp3  235505cccd7c53978204df4734f0e920763b62685082f170bd3fb2a5ec0d46da
108003.mp3  c176dfefeca59926cbcf95500f7e1cff161fe5fbc81b45c5bbf6c936abfa8d1f
112001.mp3  bb8ed6ccb26360926ff82046aa8d92fd06d76f49b7f3954f5e9c2a3050b5cd31
112002.mp3  0b117b005794ad6ac371949bc7ba37dfc0bce28897510b79e9ade583777829a3
112003.mp3  623c821118210a0731114f7d86a81a25f92b90b4fc17a46ff2553fa2ad431c1e
112004.mp3  0c791d9b40f9744a118ac364e59f4e95f0e70a8d3619bc2f9d9d31d3d9cef092
113001.mp3  6da4d35159a58276071f23442cd2435afa469a56f37c0758aaa1430ca5e4f008
113002.mp3  0f94290195c88d06006c4aafb8f6964666fc345f25822ae1a9302426161399d1
113003.mp3  ec260a03d2079bd4c4aa757c1b19d7849b9697836096b033f2ff776055c48958
113004.mp3  48187626300bfb62a93297ca2b369dbab15c0bb54cd6170b13549cefe1b1d3af
113005.mp3  5022a47b35bd871b595985b792e8f2fa281667652d81bb4d711e229388335eef
114001.mp3  a88bd24423f37b2695ba1a299612c52e02fc2cf545869517ae0ab38e29a9e253
114002.mp3  d8ea32af92008a2ff7986eba33f19fc4fd1a53bc3de832c9193a01149ac392dd
114003.mp3  c4dca72f91e4bb439cb7a4368f3f0576702e16272067494ce5a6e1e93d3b8a2c
114004.mp3  5b1d449cbcdfd51ad13b5900654a9f1dffa7ce8d80b7d3684b4fa1ecb4fa258b
114005.mp3  f04c3e4d266ae708149705d15ba4eef08941e053d7b473d6388474b38682451c
114006.mp3  5d613a767f089cf4400b4884c86a6bb870928706083952a75452571690bd801e
```

Check from the repository root: `cd datasets/reference-recitation && sha256sum -c` with the block
above saved to a file.

## 5. What the app must show or do

The licences above put these duties on the product, not only on the AI service:

| Duty                                                                                                 | From                    | Owner                          |
| ---------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------ |
| AI notice before the first use of recitation checking, always available afterwards                   | QML 1.0 (quran-muaalem) | Ola + Osama (text: genai §3.3) |
| No advertising, ad tracking or selling user data for ads                                             | QML 1.0                 | Everyone (SEC-009)             |
| Follow Islamic law in use, changes and distribution                                                  | QML 1.0                 | Religious reviewer (O-04)      |
| Fix a licence violation within 30 days                                                               | QML 1.0                 | Mohammad (risk register)       |
| Quran text shown exactly as Tanzil publishes it, credited "Tanzil Project" with a link to tanzil.net | Tanzil terms, CC BY 3.0 | Osama (credits / about screen) |
| Credit the reciter (wording once permission is confirmed)                                            | L0                      | Mohammad                       |
| Keep the MIT and Apache-2.0 licence texts of shipped components available                            | MIT, Apache-2.0         | Qussai (with the release)      |

## 6. Change log

| Date       | Change                        | By              |
| ---------- | ----------------------------- | --------------- |
| 2026-11-15 | First version of the register | Qussai / Ismail |
