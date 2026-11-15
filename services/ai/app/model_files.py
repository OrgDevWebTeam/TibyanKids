# Where the model files come from. Owner: Qussai.
#
# On a GPU machine the models live in services/ai/models/ (not in git: the repository is public and
# the files are 2.9 GB). scripts/download_models.py fills that folder with the pinned revisions and
# writes each model's revision into a REVISION file. The adapters load from there when it exists,
# and from the Hugging Face cache otherwise.
#
# A copy that holds another revision is refused, never used: results must come from the pinned
# model (OPS-008).
import os
import re
from pathlib import Path

DEFAULT_MODELS_DIR = Path(__file__).resolve().parents[1] / "models"


def check_revision(revision: str, setting: str) -> None:
    """A pin must be a full commit hash: a branch name such as "main" can change under us."""
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError(f"{setting} must be a full 40-character commit hash, not {revision!r}")


def models_dir() -> Path:
    # Read every time, so tests and deployments can point it elsewhere
    return Path(os.environ.get("MODELS_DIR", DEFAULT_MODELS_DIR))


def folder_for(repo_id: str) -> Path:
    """services/ai/models/obadx--muaalem-model-v3_2 for obadx/muaalem-model-v3_2."""
    return models_dir() / repo_id.replace("/", "--")


def local_copy(repo_id: str, revision: str) -> Path | None:
    """
    The folder holding repo_id at exactly `revision`, or None when there is no local copy.
    Raises ValueError when a local copy exists but is incomplete or holds another revision.
    """
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
