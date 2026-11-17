# Where the model files are loaded from (app/model_files.py).
import pytest

from app import model_files

REPO = "obadx/muaalem-model-v3_2"
PIN = "01a1ef9fbe40d144ef845101e89ff924aed3fef5"
OTHER = "0" * 40


@pytest.fixture(autouse=True)
def models_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    return tmp_path


def make_copy(models_dir, revision=None):
    folder = models_dir / "obadx--muaalem-model-v3_2"
    folder.mkdir()
    if revision:
        (folder / "REVISION").write_text(revision + "\n", encoding="utf-8")
    return folder


def test_the_folder_is_named_after_the_repository(models_dir):
    assert model_files.folder_for(REPO) == models_dir / "obadx--muaalem-model-v3_2"


def test_no_local_copy_means_the_hugging_face_cache():
    assert model_files.local_copy(REPO, PIN) is None


def test_a_copy_of_the_pinned_revision_is_used(models_dir):
    folder = make_copy(models_dir, PIN)
    assert model_files.local_copy(REPO, PIN) == folder


def test_a_copy_of_another_revision_is_refused(models_dir):
    make_copy(models_dir, OTHER)
    with pytest.raises(ValueError, match="not the pinned 01a1ef9fbe40"):
        model_files.local_copy(REPO, PIN)


def test_an_incomplete_copy_is_refused(models_dir):
    make_copy(models_dir)  # no REVISION file: the download did not finish
    with pytest.raises(ValueError, match="incomplete download"):
        model_files.local_copy(REPO, PIN)


def test_the_default_folder_is_services_ai_models(monkeypatch):
    monkeypatch.delenv("MODELS_DIR")
    assert model_files.models_dir().parts[-2:] == ("ai", "models")


@pytest.mark.parametrize("revision", [PIN, "a" * 40])
def test_a_full_commit_hash_is_a_valid_pin(revision):
    model_files.check_revision(revision, "SOME_REVISION")


@pytest.mark.parametrize("revision", ["main", PIN[:12], PIN.upper(), ""])
def test_anything_else_is_refused_as_a_pin(revision):
    with pytest.raises(ValueError, match="SOME_REVISION must be a full 40-character commit hash"):
        model_files.check_revision(revision, "SOME_REVISION")
