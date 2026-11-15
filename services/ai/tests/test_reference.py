# Loading the reference text (app/reference.py). Owner: Qussai.
import json

import pytest

from app import reference


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch):
    # Each test loads the text again, from the folder it chooses
    monkeypatch.setattr(reference, "ayat", {})
    monkeypatch.delenv("REFERENCE_DATA_DIR", raising=False)


def test_without_the_setting_the_repository_data_is_used():
    ayah = reference.get_ayah(112, 1)
    assert [word["position"] for word in ayah["words"]] == [1, 2, 3, 4]


def test_the_setting_chooses_the_folder(tmp_path, monkeypatch):
    surahs = [{"surah_id": 1, "ayahs": [{"ayah_id": 1, "text_uthmani": "x", "words": [{"position": 1, "text": "x"}]}]}]
    (tmp_path / reference.TEXT_FILE_NAME).write_text(json.dumps(surahs), encoding="utf-8")
    monkeypatch.setenv("REFERENCE_DATA_DIR", str(tmp_path))

    assert reference.get_ayah(1, 1)["text_uthmani"] == "x"
    assert reference.get_ayah(1, 2) is None


def test_an_ayah_outside_the_prototype_is_none():
    assert reference.get_ayah(2, 255) is None
