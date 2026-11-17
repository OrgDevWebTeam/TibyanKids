# Where the pinned model files are loaded from: services/ai/models/ (MODELS_DIR) or the Hugging Face cache.
import os
import re
from pathlib import Path

DEFAULT_MODELS_DIR = Path(__file__).resolve().parents[1] / "models"


def check_revision(revision: str, setting: str) -> None:
    """A pin must be a full 40-character commit hash: a branch name can change under us."""
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError(f"{setting} must be a full 40-character commit hash, not {revision!r}")


def models_dir() -> Path:
    """MODELS_DIR, read on every call."""
    return Path(os.environ.get("MODELS_DIR", DEFAULT_MODELS_DIR))


def folder_for(repo_id: str) -> Path:
    """The local folder for a Hugging Face repo, e.g. obadx--muaalem-model-v3_2."""
    return models_dir() / repo_id.replace("/", "--")


def local_copy(repo_id: str, revision: str) -> Path | None:
    """The local folder at exactly this revision, None if absent; raises for another or incomplete copy."""
    folder = folder_for(repo_id)
    if not folder.exists():
        return None
    marker = folder / "REVISION"
    found = marker.read_text(encoding="utf-8").strip() if marker.exists() else None
    if found != revision:
        held = f"{repo_id}@{found[:12]}" if found else "an incomplete download (no REVISION file)"
        raise ValueError(
            f"{folder} holds {held}, not the pinned {revision[:12]}. Run: python scripts/download_models.py"
        )
    return folder
