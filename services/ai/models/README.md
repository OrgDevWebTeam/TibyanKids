# Model files (not in git)

This folder holds the recitation models for the GPU machine. Only this README is in git: the
repository is public and the model files are 2.6 GB.

Fill it, at the pinned revisions, from `services/ai`:

```bash
python scripts/download_models.py
```

| Folder                              | Model                                  | Size   |
| ----------------------------------- | -------------------------------------- | ------ |
| `obadx--muaalem-model-v3_2`         | quran-muaalem (pronunciation, tajweed) | 2.3 GB |
| `tarteel-ai--whisper-base-ar-quran` | whisper-quran (words)                  | 0.3 GB |

Each folder has a `REVISION` file. The adapters load from here only when it matches the pinned
revision (`MUAALEM_REVISION`, `WHISPER_QURAN_REVISION`), and refuse a folder that holds another
one. Without this folder they use the Hugging Face cache. Revisions and licences:
`docs/ai/model-register.md`.

Laptops run the AI service in mock mode and need none of this.
