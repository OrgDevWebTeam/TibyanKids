# Word comparison of the whisper-quran adapter (app/adapters/whisper_quran.py). Owner: Qussai.
# No GPU needed: the model itself is replaced by a fake transcript.
import json
from pathlib import Path

import pytest

from app import reference
from app.adapters import whisper_quran
from app.adapters.whisper_quran import compare_words, normalize

OMISSION = "ERR_MEM_OMISSION"
SUBSTITUTION = "ERR_MEM_SUBSTITUTION"
INSERTION = "ERR_MEM_INSERTION"

# Al-Ikhlas 1 as Imlaei reference words (text_imlaei), and the same ayah without diacritics
IKHLAS_1 = ["قُلْ", "هُوَ", "اللَّهُ", "أَحَدٌ"]
IKHLAS_1_PLAIN = ["قل", "هو", "الله", "احد"]

# What whisper-quran wrote for the reference recitation of each prototype ayah (all correct readings).
# Recorded on the GPU machine with the model revision in app/adapters/whisper_quran.py.
REFERENCE_TRANSCRIPTS = json.loads(
    (Path(__file__).parent / "data" / "whisper_reference_transcripts.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize(
    "word, expected",
    [
        ("ٱللَّهِ", "الله"),  # alif wasla, shadda and kasra
        ("اللَّهِ", "الله"),  # the same word in Imlaei spelling
        ("أَحَدٌ", "احد"),  # hamza on alif, tanwin
        ("إِيَّاكَ", "اياك"),  # hamza under alif
        ("ٱلْفَلَقِ", "الفلق"),  # sukun
        ("فِى", "في"),  # alif maqsura
        ("لَّهُۥ", "له"),  # small waw
        ("النَّفَّاثَاتِ", "النفاثات"),  # full alif in Imlaei spelling is kept
        ("الرَّحْمَٰنِ", "الرحمن"),  # dagger alif in Imlaei spelling is dropped
        ("إِلَٰهِ", "اله"),
        ("الرَّحْمَنِ", "الرحمن"),  # as whisper writes it
    ],
)
def test_normalize(word, expected):
    assert normalize(word) == expected


def test_the_same_ayah_in_plain_spelling_has_no_errors():
    assert compare_words(IKHLAS_1, IKHLAS_1_PLAIN) == []


def test_a_skipped_word():
    assert compare_words(["a", "b", "c"], ["a", "c"]) == [(2, OMISSION)]


def test_several_skipped_words_at_the_end():
    assert compare_words(["a", "b", "c"], ["a"]) == [(2, OMISSION), (3, OMISSION)]


def test_a_different_word():
    assert compare_words(["a", "b", "c"], ["a", "x", "c"]) == [(2, SUBSTITUTION)]


def test_an_extra_word_points_to_the_word_before_it():
    assert compare_words(["a", "b"], ["a", "x", "b"]) == [(1, INSERTION)]


def test_an_extra_word_at_the_end_points_to_the_last_word():
    assert compare_words(["a", "b"], ["a", "b", "x"]) == [(2, INSERTION)]


def test_an_extra_word_before_the_first_word_points_to_word_1():
    # There is no word before it, so the first word is used
    assert compare_words(["a", "b"], ["x", "a", "b"]) == [(1, INSERTION)]


def test_fewer_said_words_in_a_changed_part():
    # b and c were replaced by one word: b is different, c was skipped
    assert compare_words(["a", "b", "c", "d"], ["a", "x", "d"]) == [(2, SUBSTITUTION), (3, OMISSION)]


def test_more_said_words_in_a_changed_part():
    # b was replaced by two words: b is different, and one word was added after it
    assert compare_words(["a", "b", "c"], ["a", "x", "y", "c"]) == [(2, SUBSTITUTION), (2, INSERTION)]


def test_nothing_said():
    assert compare_words(["a", "b"], []) == [(1, OMISSION), (2, OMISSION)]


@pytest.mark.parametrize("name", sorted(REFERENCE_TRANSCRIPTS))
def test_every_reference_recitation_is_read_without_errors(name):
    # Regression test for false errors on correct readings, such as الرحمن in 1:1 and 1:3 and اله in 114:3
    ayah = reference.get_ayah(int(name[:3]), int(name[3:]))
    words = [word["text_imlaei"] for word in ayah["words"]]
    assert compare_words(words, REFERENCE_TRANSCRIPTS[name].split()) == []


def test_there_is_a_transcript_for_every_prototype_ayah():
    assert len(REFERENCE_TRANSCRIPTS) == 25


def test_analyze_keeps_one_finding_per_word_and_applies_the_policy(monkeypatch):
    monkeypatch.delenv("CONFIDENCE_THRESHOLD", raising=False)
    # Word 2 is replaced by two words: a substitution and an insertion on the same word
    monkeypatch.setattr(whisper_quran, "transcribe", lambda samples: (["قل", "x", "y", "الله", "احد"], 0.9))
    monkeypatch.setattr(whisper_quran, "model_version", lambda: "test")

    result = whisper_quran.analyze(samples=None, reference_words=IKHLAS_1, level="beginner", attempt_id="a1")

    assert result.decision == "error"
    assert [(f.wordIndex, f.code) for f in result.findings] == [(2, SUBSTITUTION)]
    assert result.findings[0].confidence == 0.9
    assert result.model == "whisper-quran"
