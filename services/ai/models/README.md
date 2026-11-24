# Model files (not in git)

This folder holds the models for the GPU machine: the two recitation models and the Arabic words
model. Only this README is in git: the repository is public, and the model files are 5.4 GB
(GitHub refuses files over 100 MB).

Fill it, at the pinned revisions, from `services/ai`:

```bash
python scripts/download_models.py
```

| Folder                              | Model                                           | Size   |
| ----------------------------------- | ----------------------------------------------- | ------ |
| `obadx--muaalem-model-v3_2`         | quran-muaalem (pronunciation, tajweed)          | 2.3 GB |
| `tarteel-ai--whisper-base-ar-quran` | whisper-quran (words)                           | 0.3 GB |
| `Systran--faster-whisper-large-v3`  | Whisper large-v3, Arabic words stage (ADR-0010) | 2.9 GB |

Each folder has a `REVISION` file. The adapters load from here only when it matches the pinned
revision (`MUAALEM_REVISION`, `WHISPER_QURAN_REVISION`, `ARABIC_WORDS_REVISION`), and refuse a
folder that holds another one. Without this folder the recitation adapters use the Hugging Face
cache; the Arabic words model needs this folder (the cache needs symbolic links, which Windows
refuses without Developer Mode). Revisions and licences:
`docs/ai/model-register.md`.

Laptops run the AI service in mock mode and need none of this.
