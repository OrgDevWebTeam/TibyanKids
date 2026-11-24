# whisper-quran's word logic: spelling, word comparison, token grouping.
import json
from pathlib import Path

import pytest

from app import reference
from app.adapters.whisper_quran import compare_words, finding_confidence, group_words, normalize

OMISSION = "ERR_MEM_OMISSION"
SUBSTITUTION = "ERR_MEM_SUBSTITUTION"
INSERTION = "ERR_MEM_INSERTION"

IKHLAS_1 = ["قُلْ", "هُوَ", "اللَّهُ", "أَحَدٌ"]
IKHLAS_1_PLAIN = ["قل", "هو", "الله", "احد"]

REFERENCE_TRANSCRIPTS = json.loads(
    (Path(__file__).parent / "data" / "whisper_reference_transcripts.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize(
    "word, expected",
    [
        ("ٱللَّهِ", "الله"),
        ("اللَّهِ", "الله"),
        ("أَحَدٌ", "احد"),
        ("إِيَّاكَ", "اياك"),
        ("ٱلْفَلَقِ", "الفلق"),
        ("فِى", "في"),
        ("لَّهُۥ", "له"),
        ("النَّفَّاثَاتِ", "النفاثات"),
        ("الرَّحْمَٰنِ", "الرحمن"),
        ("إِلَٰهِ", "اله"),
        ("الرَّحْمَنِ", "الرحمن"),
    ],
)
def test_normalize(word, expected):
    """Normalize."""
    assert normalize(word) == expected


def test_the_same_ayah_in_plain_spelling_has_no_errors():
    """The same ayah in plain spelling has no errors."""
    assert compare_words(IKHLAS_1, IKHLAS_1_PLAIN) == []


def test_a_skipped_word_rests_on_the_said_words_around_the_gap():
    """A skipped word rests on the said words around the gap."""
    assert compare_words(["a", "b", "c"], ["a", "c"]) == [(2, OMISSION, (0, 1))]


def test_several_skipped_words_at_the_end():
    """Several skipped words at the end."""
    assert compare_words(["a", "b", "c"], ["a"]) == [(2, OMISSION, (0,)), (3, OMISSION, (0,))]


def test_a_different_word_rests_on_the_word_said_instead():
    """A different word rests on the word said instead."""
    assert compare_words(["a", "b", "c"], ["a", "x", "c"]) == [(2, SUBSTITUTION, (1,))]


def test_an_extra_word_points_to_the_word_before_it():
    """An extra word points to the word before it."""
    assert compare_words(["a", "b"], ["a", "x", "b"]) == [(1, INSERTION, (1,))]


def test_an_extra_word_at_the_end_points_to_the_last_word():
    """An extra word at the end points to the last word."""
    assert compare_words(["a", "b"], ["a", "b", "x"]) == [(2, INSERTION, (2,))]


def test_an_extra_word_before_the_first_word_points_to_word_1():
    """An extra word before the first word points to word 1."""
    assert compare_words(["a", "b"], ["x", "a", "b"]) == [(1, INSERTION, (0,))]


def test_fewer_said_words_in_a_changed_part():
    """Fewer said words in a changed part."""
    expected = [(2, SUBSTITUTION, (1,)), (3, OMISSION, (1,))]
    assert compare_words(["a", "b", "c", "d"], ["a", "x", "d"]) == expected


def test_more_said_words_in_a_changed_part():
    """More said words in a changed part."""
    expected = [(2, SUBSTITUTION, (1,)), (2, INSERTION, (2,))]
    assert compare_words(["a", "b", "c"], ["a", "x", "y", "c"]) == expected


def test_nothing_said_has_no_evidence():
    """Nothing said has no evidence."""
    assert compare_words(["a", "b"], []) == [(1, OMISSION, ()), (2, OMISSION, ())]


def test_a_finding_takes_the_lowest_confidence_of_its_evidence():
    """A finding takes the lowest confidence of its evidence."""
    assert finding_confidence((0, 2), [0.9, 0.1, 0.5]) == 0.5


def test_a_finding_without_evidence_has_confidence_0():
    """A finding without evidence has confidence 0."""
    assert finding_confidence((), [0.9]) == 0.0


def test_group_words_starts_a_word_at_each_space_token():
    """Group words starts a word at each space token."""
    tokens = ["ب", "ِ", "Ġال", "ر"]
    assert group_words(tokens, [0.9, 1.0, 0.8, 0.95]) == [([0, 1], 0.9), ([2, 3], 0.8)]


def test_group_words_when_the_first_token_has_a_space():
    """Group words when the first token has a space."""
    assert group_words(["Ġق", "ل"], [1.0, 0.7]) == [([0, 1], 0.7)]


def test_group_words_with_no_tokens():
    """Group words with no tokens."""
    assert group_words([], []) == []


@pytest.mark.parametrize("name", sorted(REFERENCE_TRANSCRIPTS))
def test_every_reference_recitation_is_read_without_errors(name):
    """Every reference recitation is read without errors."""
    ayah = reference.get_ayah(int(name[:3]), int(name[3:]))
    words = [word["text_imlaei"] for word in ayah["words"]]
    assert compare_words(words, REFERENCE_TRANSCRIPTS[name].split()) == []


def test_there_is_a_transcript_for_every_prototype_ayah():
    """There is a transcript for every prototype ayah."""
    assert len(REFERENCE_TRANSCRIPTS) == 25
