# Word comparison of the whisper-quran adapter (app/adapters/whisper_quran.py). Owner: Qussai.
# No GPU needed: the model itself is replaced by a fake transcript.
import json
from pathlib import Path

import pytest

from app import reference
from app.adapters import whisper_quran
from app.adapters.whisper_quran import compare_words, finding_confidence, group_words, normalize

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


# Each finding is (wordIndex, code, evidence): evidence holds the positions (from 0) of the said words
# whose confidence the finding takes.


def test_a_skipped_word_rests_on_the_said_words_around_the_gap():
    assert compare_words(["a", "b", "c"], ["a", "c"]) == [(2, OMISSION, (0, 1))]


def test_several_skipped_words_at_the_end():
    assert compare_words(["a", "b", "c"], ["a"]) == [(2, OMISSION, (0,)), (3, OMISSION, (0,))]


def test_a_different_word_rests_on_the_word_said_instead():
    assert compare_words(["a", "b", "c"], ["a", "x", "c"]) == [(2, SUBSTITUTION, (1,))]


def test_an_extra_word_points_to_the_word_before_it():
    assert compare_words(["a", "b"], ["a", "x", "b"]) == [(1, INSERTION, (1,))]


def test_an_extra_word_at_the_end_points_to_the_last_word():
    assert compare_words(["a", "b"], ["a", "b", "x"]) == [(2, INSERTION, (2,))]


def test_an_extra_word_before_the_first_word_points_to_word_1():
    # There is no word before it, so the first word is used
    assert compare_words(["a", "b"], ["x", "a", "b"]) == [(1, INSERTION, (0,))]


def test_fewer_said_words_in_a_changed_part():
    # b and c were replaced by one word: b is different, c was skipped
    assert compare_words(["a", "b", "c", "d"], ["a", "x", "d"]) == [(2, SUBSTITUTION, (1,)), (3, OMISSION, (1,))]


def test_more_said_words_in_a_changed_part():
    # b was replaced by two words: b is different, and one word was added after it
    assert compare_words(["a", "b", "c"], ["a", "x", "y", "c"]) == [(2, SUBSTITUTION, (1,)), (2, INSERTION, (2,))]


def test_nothing_said_has_no_evidence():
    assert compare_words(["a", "b"], []) == [(1, OMISSION, ()), (2, OMISSION, ())]


def test_a_finding_takes_the_lowest_confidence_of_its_evidence():
    assert finding_confidence((0, 2), [0.9, 0.1, 0.5]) == 0.5


def test_a_finding_without_evidence_has_confidence_0():
    assert finding_confidence((), [0.9]) == 0.0


def test_group_words_starts_a_word_at_each_space_token():
    # Byte-level tokens: "Ġ" is a space. A word's confidence is its lowest token probability.
    tokens = ["ب", "ِ", "Ġال", "ر"]
    assert group_words(tokens, [0.9, 1.0, 0.8, 0.95]) == [([0, 1], 0.9), ([2, 3], 0.8)]


def test_group_words_when_the_first_token_has_a_space():
    assert group_words(["Ġق", "ل"], [1.0, 0.7]) == [([0, 1], 0.7)]


def test_group_words_with_no_tokens():
    assert group_words([], []) == []


@pytest.mark.parametrize("name", sorted(REFERENCE_TRANSCRIPTS))
def test_every_reference_recitation_is_read_without_errors(name):
    # Regression test for false errors on correct readings, such as الرحمن in 1:1 and 1:3 and اله in 114:3
    ayah = reference.get_ayah(int(name[:3]), int(name[3:]))
    words = [word["text_imlaei"] for word in ayah["words"]]
    assert compare_words(words, REFERENCE_TRANSCRIPTS[name].split()) == []


def test_there_is_a_transcript_for_every_prototype_ayah():
    assert len(REFERENCE_TRANSCRIPTS) == 25


SAID = ["قل", "x", "y", "الله", "احد"]  # word 2 replaced by two words: x instead of it, y extra


@pytest.fixture
def fake_model(monkeypatch):
    monkeypatch.delenv("CONFIDENCE_THRESHOLD", raising=False)
    monkeypatch.setattr(whisper_quran, "model_version", lambda: "test")

    def use(confidences):
        monkeypatch.setattr(whisper_quran, "transcribe", lambda samples: (SAID, confidences))

    return use


def run(level="beginner"):
    return whisper_quran.analyze(samples=None, reference_words=IKHLAS_1, level=level, attempt_id="a1")


def test_analyze_keeps_one_finding_per_word_with_that_word_s_confidence(fake_model):
    # x is heard clearly; the unsure extra word y belongs to the dropped insertion and does not count
    fake_model([1.0, 0.92, 0.5, 1.0, 1.0])
    result = run()
    assert result.decision == "error"
    assert [(f.wordIndex, f.code, f.confidence) for f in result.findings] == [(2, SUBSTITUTION, 0.92)]
    assert result.model == "whisper-quran"


def test_analyze_sends_an_unsure_word_to_the_teacher(fake_model):
    fake_model([1.0, 0.4, 1.0, 1.0, 1.0])
    result = run()
    assert result.decision == "uncertain"
    assert result.findings[0].confidence == 0.4


def test_a_model_that_does_not_finish_sends_the_ayah_to_the_teacher(fake_model, monkeypatch):
    # Noisy audio can make whisper repeat itself until MAX_NEW_TOKENS: its text is not what was said
    def runaway(samples):
        raise whisper_quran.Runaway()

    monkeypatch.setattr(whisper_quran, "transcribe", runaway)
    result = run()
    assert result.decision == "uncertain"
    assert result.findings == []
    assert result.quality == "ok"


def test_the_output_cap_fits_the_model():
    # 448 positions in whisper-base, 4 of them taken by the prompt; the longest prototype ayah takes 75
    assert 75 * 2 <= whisper_quran.MAX_NEW_TOKENS <= 448 - 4


@pytest.fixture
def fake_transformers(monkeypatch):
    """A fake transformers module that records what load_model() asks for; no GPU or download."""
    import sys
    import types

    calls = {}

    class FakeModel:
        config = types.SimpleNamespace(max_target_positions=448)

        @classmethod
        def from_pretrained(cls, name, **kwargs):
            calls["model"] = (name, kwargs)
            return cls()

        def to(self, device):
            return self

        def eval(self):
            return self

    class FakeProcessor:
        @classmethod
        def from_pretrained(cls, name, **kwargs):
            calls["processor"] = (name, kwargs)
            return cls()

    fake = types.ModuleType("transformers")
    fake.WhisperForConditionalGeneration = FakeModel
    fake.WhisperProcessor = FakeProcessor
    monkeypatch.setitem(sys.modules, "transformers", fake)
    monkeypatch.setattr(whisper_quran, "model", None)
    monkeypatch.setattr(whisper_quran, "processor", None)
    return calls


def test_load_model_uses_the_local_copy_of_the_pinned_revision(fake_transformers, tmp_path, monkeypatch):
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    folder = tmp_path / "tarteel-ai--whisper-base-ar-quran"
    folder.mkdir()
    (folder / "REVISION").write_text(whisper_quran.MODEL_REVISION, encoding="utf-8")

    whisper_quran.load_model()

    assert fake_transformers["processor"] == (str(folder), {})
    assert fake_transformers["model"] == (str(folder), {"use_safetensors": False})


def test_load_model_refuses_a_local_copy_of_another_revision(fake_transformers, tmp_path, monkeypatch):
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    folder = tmp_path / "tarteel-ai--whisper-base-ar-quran"
    folder.mkdir()
    (folder / "REVISION").write_text("0" * 40, encoding="utf-8")

    with pytest.raises(ValueError, match="not the pinned"):
        whisper_quran.load_model()


def test_load_model_asks_for_the_pinned_revision_without_a_local_copy(fake_transformers, tmp_path, monkeypatch):
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))  # empty: no local copy

    whisper_quran.load_model()

    pin = whisper_quran.MODEL_REVISION
    assert fake_transformers["processor"] == (whisper_quran.MODEL_NAME, {"revision": pin})
    assert fake_transformers["model"] == (whisper_quran.MODEL_NAME, {"revision": pin, "use_safetensors": False})
    assert whisper_quran.model_version().endswith("@" + pin[:12])
