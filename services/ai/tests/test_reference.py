# Loading the reference text and word timings (app/reference.py). Owner: Qussai.
import json

import pytest

from app import reference
from app.policy import make_finding


@pytest.fixture(autouse=True)
def fresh_cache(monkeypatch):
    # Each test loads the text again, from the folder it chooses
    monkeypatch.setattr(reference, "ayat", {})
    monkeypatch.setattr(reference, "timings", {})
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


def test_every_word_of_every_prototype_ayah_has_a_timing():
    reference.load_ayat()
    for (surah, ayah), text in reference.ayat.items():
        positions = [word["position"] for word in text["words"]]
        assert sorted(reference.get_word_timings(surah, ayah)) == positions, f"{surah}:{ayah}"


def test_the_timings_of_an_ayah_are_read_by_word_position():
    assert reference.get_word_timings(1, 1)[2] == (520, 1240)


def test_an_ayah_without_timings_raises():
    with pytest.raises(ValueError):
        reference.get_word_timings(2, 255)


def test_each_finding_gets_the_segment_of_its_word():
    findings = [
        make_finding(1, "ERR_MEM_OMISSION", 0.9, 0, 0),
        make_finding(3, "ERR_PRON_HARAKA", 0.8, 0, 0),
    ]

    result = reference.add_word_segments(findings, {1: (0, 520), 2: (520, 1240), 3: (1240, 2400)})

    assert [(f.wordIndex, f.wordStartMs, f.wordEndMs) for f in result] == [(1, 0, 520), (3, 1240, 2400)]
    # Everything else stays the same
    assert [f.code for f in result] == ["ERR_MEM_OMISSION", "ERR_PRON_HARAKA"]


def test_a_finding_on_a_word_without_a_timing_raises():
    with pytest.raises(ValueError):
        reference.add_word_segments([make_finding(5, "ERR_MEM_OMISSION", 0.9, 0, 0)], {1: (0, 520)})
