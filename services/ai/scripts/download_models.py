# Puts the recitation models into services/ai/models/, at the pinned revisions. Owner: Qussai.
#
# Usage (from services/ai, on a GPU machine):
#   python scripts/download_models.py
#
# The folder is not in git (the repository is public and the files are 2.9 GB). Each model gets its
# own folder with a REVISION file; the adapters load from there and refuse a folder that holds
# another revision (app/model_files.py). Files already in the Hugging Face cache are copied without
# a new download, so this also works offline with HF_HUB_OFFLINE=1.
#
# Silero VAD is not handled here: it ships inside the silero-vad package (requirements-gpu.txt).
import shutil
import sys
from pathlib import Path

from huggingface_hub import snapshot_download

# Lets this script do "from app..." like the service does
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.adapters import muaalem, whisper_quran  # noqa: E402
from app.model_files import folder_for, models_dir  # noqa: E402

MODELS = [
    (muaalem.MODEL_NAME, muaalem.MODEL_REVISION, muaalem.MODEL_FILES),
    (whisper_quran.MODEL_NAME, whisper_quran.MODEL_REVISION, whisper_quran.MODEL_FILES),
]


def size_gb(folder):
    return sum(f.stat().st_size for f in folder.rglob("*") if f.is_file()) / 1024**3


def main():
    print(f"Models folder: {models_dir()}")
    for repo_id, revision, files in MODELS:
        target = folder_for(repo_id)
        marker = target / "REVISION"
        if marker.exists() and marker.read_text(encoding="utf-8").strip() == revision:
            print(f"{repo_id}@{revision[:12]}: already there ({size_gb(target):.2f} GB)")
            continue

        # Download next to the target and move it into place only when complete, so a broken
        # download never looks like a valid copy
        partial = target.with_name(target.name + ".partial")
        shutil.rmtree(partial, ignore_errors=True)
        # The pinned files from the Hugging Face cache (downloaded first if missing), then a real copy:
        # the cache may hold symbolic links, which copytree follows
        cached = snapshot_download(repo_id, revision=revision, allow_patterns=files)
        shutil.copytree(cached, partial)
        (partial / "REVISION").write_text(revision + "\n", encoding="utf-8")
        shutil.rmtree(target, ignore_errors=True)
        partial.rename(target)
        print(f"{repo_id}@{revision[:12]}: ready ({size_gb(target):.2f} GB)")


if __name__ == "__main__":
    main()
