# Word comparison of the whisper-quran adapter (app/adapters/whisper_quran.py). Owner: Qussai.
# No GPU needed: the model itself is replaced by a fake transcript.
import pytest

from app.adapters import whisper_quran
from app.adapters.whisper_quran import compare_words, normalize

OMISSION = "ERR_MEM_OMISSION"
SUBSTITUTION = "ERR_MEM_SUBSTITUTION"
INSERTION = "ERR_MEM_INSERTION"

# Al-Ikhlas 1 as Uthmani reference words, and the same ayah in plain spelling
IKHLAS_1 = ["قُلْ", "هُوَ", "ٱللَّهُ", "أَحَدٌ"]
IKHLAS_1_PLAIN = ["قل", "هو", "الله", "احد"]


@pytest.mark.parametrize(
    "word, expected",
    [
        ("ٱللَّهِ", "الله"),  # alif wasla, shadda and kasra
        ("أَحَدٌ", "احد"),  # hamza on alif, tanwin
        ("إِيَّاكَ", "اياك"),  # hamza under alif
        ("ٱلْفَلَقِ", "الفلق"),  # sukun
        ("فِى", "في"),  # alif maqsura
        ("لَّهُۥ", "له"),  # small waw
        ("ٱلنَّفَّٰثَٰتِ", "النفاثات"),  # dagger alif written as alif in plain spelling
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


@pytest.mark.xfail(
    strict=True,
    reason="Known bug (plan A2): the dagger alif becomes a full alif, so plain-spelling الرحمن and اله "
    "do not match the Uthmani reference. Remove this mark when A2 lands.",
)
@pytest.mark.parametrize("reference, said", [("ٱلرَّحْمَٰنِ", "الرحمن"), ("إِلَٰهِ", "اله")])
def test_dagger_alif_words_in_plain_spelling_match(reference, said):
    assert compare_words([reference], [said]) == []


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
