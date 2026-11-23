# whisper-quran's model side with a fake transcript and fake transformers classes (no GPU, no download).
import types

import pytest

from app.adapters import whisper_quran
from app.policy import decide

SUBSTITUTION = "ERR_MEM_SUBSTITUTION"

IKHLAS_1 = ["قُلْ", "هُوَ", "اللَّهُ", "أَحَدٌ"]

SAID = ["قل", "x", "y", "الله", "احد"]


@pytest.fixture
def fake_transcript(monkeypatch):
    """whisper-quran's transcribe replaced by a fixed transcript."""
    monkeypatch.delenv("CONFIDENCE_THRESHOLD", raising=False)

    def use(confidences):
        """Uses these word confidences."""
        monkeypatch.setattr(whisper_quran, "transcribe", lambda samples: (SAID, confidences))

    return use


def test_one_finding_per_word_with_that_word_s_confidence(fake_transcript):
    """One finding per word with that word s confidence."""
    fake_transcript([1.0, 0.92, 0.5, 1.0, 1.0])

    findings = whisper_quran.find_errors(None, IKHLAS_1)

    assert [(f.wordIndex, f.code, f.confidence) for f in findings] == [(2, SUBSTITUTION, 0.92)]
    assert decide(findings, "beginner")[0] == "error"


def test_an_unsure_word_keeps_its_own_message_until_decide(fake_transcript):
    """An unsure word keeps its own message until decide."""
    fake_transcript([1.0, 0.4, 1.0, 1.0, 1.0])

    findings = whisper_quran.find_errors(None, IKHLAS_1)

    assert [(f.wordIndex, f.code, f.confidence, f.messageKey) for f in findings] == [
        (2, SUBSTITUTION, 0.4, "FEEDBACK_WORD_DIFFERENT")
    ]
    assert decide(findings, "beginner")[0] == "uncertain"


def test_find_errors_lets_a_runaway_through(monkeypatch):
    """Find errors lets a runaway through."""
    def runaway(samples):
        """A transcript that never ends."""
        raise whisper_quran.Runaway()

    monkeypatch.setattr(whisper_quran, "transcribe", runaway)
    with pytest.raises(whisper_quran.Runaway):
        whisper_quran.find_errors(None, IKHLAS_1)


def test_the_output_cap_fits_the_model():
    """The output cap fits the model."""
    assert 75 * 2 <= whisper_quran.MAX_NEW_TOKENS <= 448 - 4


@pytest.fixture
def fake_transformers(monkeypatch):
    """transformers' Whisper classes replaced, recording how they are called."""
    calls = {}

    class FakeModel:
        """Stands in for WhisperForConditionalGeneration."""
        config = types.SimpleNamespace(max_target_positions=448)

        @classmethod
        def from_pretrained(cls, name, **kwargs):
            """Records the call and returns a model."""
            calls["model"] = (name, kwargs)
            return cls()

        def to(self, device):
            """Moving to a device changes nothing."""
            return self

        def eval(self):
            """Eval mode changes nothing."""
            return self

    class FakeProcessor:
        """Stands in for WhisperProcessor."""
        @classmethod
        def from_pretrained(cls, name, **kwargs):
            """Records the call and returns a processor."""
            calls["processor"] = (name, kwargs)
            return cls()

    monkeypatch.setattr(whisper_quran, "WhisperForConditionalGeneration", FakeModel)
    monkeypatch.setattr(whisper_quran, "WhisperProcessor", FakeProcessor)
    whisper_quran.load_model.cache_clear()
    yield calls
    whisper_quran.load_model.cache_clear()


def test_load_model_uses_the_local_copy_of_the_pinned_revision(fake_transformers, tmp_path, monkeypatch):
    """Load model uses the local copy of the pinned revision."""
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    folder = tmp_path / "tarteel-ai--whisper-base-ar-quran"
    folder.mkdir()
    (folder / "REVISION").write_text(whisper_quran.HF_REVISION, encoding="utf-8")

    whisper_quran.load_model()

    assert fake_transformers["processor"] == (str(folder), {})
    assert fake_transformers["model"] == (str(folder), {"use_safetensors": False})


def test_load_model_refuses_a_local_copy_of_another_revision(fake_transformers, tmp_path, monkeypatch):
    """Load model refuses a local copy of another revision."""
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    folder = tmp_path / "tarteel-ai--whisper-base-ar-quran"
    folder.mkdir()
    (folder / "REVISION").write_text("0" * 40, encoding="utf-8")

    with pytest.raises(ValueError, match="not the pinned"):
        whisper_quran.load_model()


def test_load_model_asks_for_the_pinned_revision_without_a_local_copy(
    fake_transformers, tmp_path, monkeypatch
):
    """Load model asks for the pinned revision without a local copy."""
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))

    whisper_quran.load_model()

    pin = whisper_quran.HF_REVISION
    assert fake_transformers["processor"] == (whisper_quran.HF_REPO, {"revision": pin})
    assert fake_transformers["model"] == (whisper_quran.HF_REPO, {"revision": pin, "use_safetensors": False})
    assert whisper_quran.model_version().endswith("@" + pin[:12])
