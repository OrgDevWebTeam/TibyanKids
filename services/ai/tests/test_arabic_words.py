# The Arabic words adapter (app/adapters/arabic_words.py): where the pinned model is loaded from.
import pytest

from app.adapters import arabic_words


def test_the_model_comes_from_its_pinned_folder(tmp_path, monkeypatch):
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    folder = tmp_path / "Systran--faster-whisper-large-v3"
    folder.mkdir()
    (folder / "REVISION").write_text(arabic_words.HF_REVISION + "\n", encoding="utf-8")
    assert arabic_words.model_folder() == folder


def test_a_missing_folder_says_to_run_download_models(tmp_path, monkeypatch):
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    with pytest.raises(FileNotFoundError, match="download_models.py"):
        arabic_words.model_folder()


def test_a_folder_at_another_revision_is_refused(tmp_path, monkeypatch):
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    folder = tmp_path / "Systran--faster-whisper-large-v3"
    folder.mkdir()
    (folder / "REVISION").write_text("0" * 40 + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="not the pinned"):
        arabic_words.model_folder()


def test_the_version_names_the_pinned_revision():
    assert arabic_words.model_version() == f"{arabic_words.HF_REPO}@{arabic_words.HF_REVISION[:12]}"
