# Copies the pinned models into services/ai/models/: python scripts/download_models.py
import shutil
import sys
from pathlib import Path

from huggingface_hub import snapshot_download

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.adapters import arabic_words, muaalem, whisper_quran  # noqa: E402
from app.model_files import folder_for, models_dir  # noqa: E402

MODELS = [
    (muaalem.HF_REPO, muaalem.HF_REVISION, muaalem.HF_FILES),
    (whisper_quran.HF_REPO, whisper_quran.HF_REVISION, whisper_quran.HF_FILES),
    (arabic_words.HF_REPO, arabic_words.HF_REVISION, arabic_words.HF_FILES),
]


def main():
    """Downloads each model not yet at its pinned revision, then moves it into place."""
    print(f"Models folder: {models_dir()}")
    for repo_id, revision, files in MODELS:
        target = folder_for(repo_id)
        marker = target / "REVISION"
        if marker.exists() and marker.read_text(encoding="utf-8").strip() == revision:
            size = sum(f.stat().st_size for f in target.rglob("*") if f.is_file()) / 1024**3
            print(f"{repo_id}@{revision[:12]}: already there ({size:.2f} GB)")
            continue

        partial = target.with_name(target.name + ".partial")
        shutil.rmtree(partial, ignore_errors=True)
        snapshot_download(repo_id, revision=revision, allow_patterns=files, local_dir=partial)
        (partial / "REVISION").write_text(revision + "\n", encoding="utf-8")
        shutil.rmtree(target, ignore_errors=True)
        partial.rename(target)
        size = sum(f.stat().st_size for f in target.rglob("*") if f.is_file()) / 1024**3
        print(f"{repo_id}@{revision[:12]}: ready ({size:.2f} GB)")


if __name__ == "__main__":
    main()
