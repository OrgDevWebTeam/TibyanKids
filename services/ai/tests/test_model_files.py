# Where the model files are loaded from (app/model_files.py).
import json

import pytest

from app import model_files

REPO = "obadx/muaalem-model-v3_2"
PIN = "01a1ef9fbe40d144ef845101e89ff924aed3fef5"
OTHER = "0" * 40


@pytest.fixture(autouse=True)
def models_dir(tmp_path, monkeypatch):
    """MODELS_DIR set to a temporary folder."""
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    return tmp_path


def make_copy(models_dir, revision=None):
    """A local model folder, with a REVISION file when a revision is given."""
    folder = models_dir / "obadx--muaalem-model-v3_2"
    folder.mkdir()
    if revision:
        (folder / "REVISION").write_text(revision + "\n", encoding="utf-8")
    return folder


def test_the_folder_is_named_after_the_repository(models_dir):
    """The folder is named after the repository."""
    assert model_files.folder_for(REPO) == models_dir / "obadx--muaalem-model-v3_2"


def test_no_local_copy_means_the_hugging_face_cache():
    """No local copy means the hugging face cache."""
    assert model_files.local_copy(REPO, PIN) is None


def test_a_copy_of_the_pinned_revision_is_used(models_dir):
    """A copy of the pinned revision is used."""
    folder = make_copy(models_dir, PIN)
    assert model_files.local_copy(REPO, PIN) == folder


@pytest.mark.parametrize("key", sorted(model_files.CODE_LOADING_KEYS))
def test_a_copy_that_asks_to_load_code_is_refused(models_dir, key):
    """A config that names code to fetch or run is refused (Dependabot alerts #3 and #8)."""
    folder = make_copy(models_dir, PIN)
    config = {"model_type": "whisper", key: "evil/repo"}
    (folder / "config.json").write_text(json.dumps(config), encoding="utf-8")
    with pytest.raises(ValueError, match=key):
        model_files.local_copy(REPO, PIN)


def test_json_files_that_are_lists_are_fine(models_dir):
    """A vocabulary stored as a list has no settings to check."""
    folder = make_copy(models_dir, PIN)
    (folder / "vocabulary.json").write_text(json.dumps(["auto_map", "a"]), encoding="utf-8")
    assert model_files.local_copy(REPO, PIN) == folder


def test_a_copy_of_another_revision_is_refused(models_dir):
    """A copy of another revision is refused."""
    make_copy(models_dir, OTHER)
    with pytest.raises(ValueError, match="not the pinned 01a1ef9fbe40"):
        model_files.local_copy(REPO, PIN)


def test_an_incomplete_copy_is_refused(models_dir):
    """An incomplete copy is refused."""
    make_copy(models_dir)
    with pytest.raises(ValueError, match="incomplete download"):
        model_files.local_copy(REPO, PIN)


def test_the_default_folder_is_services_ai_models(monkeypatch):
    """The default folder is services ai models."""
    monkeypatch.delenv("MODELS_DIR")
    assert model_files.models_dir().parts[-2:] == ("ai", "models")


@pytest.mark.parametrize("revision", [PIN, "a" * 40])
def test_a_full_commit_hash_is_a_valid_pin(revision):
    """A full commit hash is a valid pin."""
    model_files.check_revision(revision, "SOME_REVISION")


@pytest.mark.parametrize("revision", ["main", PIN[:12], PIN.upper(), ""])
def test_anything_else_is_refused_as_a_pin(revision):
    """Anything else is refused as a pin."""
    with pytest.raises(ValueError, match="SOME_REVISION must be a full 40-character commit hash"):
        model_files.check_revision(revision, "SOME_REVISION")
