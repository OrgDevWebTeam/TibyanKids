# whisper-quran's model side (app/adapters/whisper_quran.py): find_errors() and analyze() with a
# fake transcript, the runaway case, the output cap, and model loading with a fake transformers
# module. Owner: Qussai. No GPU and no download needed.
import pytest

from app.adapters import whisper_quran

SUBSTITUTION = "ERR_MEM_SUBSTITUTION"

# Al-Ikhlas 1 as Imlaei reference words (text_imlaei)
IKHLAS_1 = ["قُلْ", "هُوَ", "اللَّهُ", "أَحَدٌ"]

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


def test_find_errors_returns_findings_without_deciding(fake_model):
    # An unsure word keeps its own message: the decision (and the teacher message) is decide()'s job
    fake_model([1.0, 0.4, 1.0, 1.0, 1.0])
    findings = whisper_quran.find_errors(None, IKHLAS_1)
    assert [(f.wordIndex, f.code, f.confidence, f.messageKey) for f in findings] == [
        (2, SUBSTITUTION, 0.4, "FEEDBACK_WORD_DIFFERENT")
    ]


def test_find_errors_lets_a_runaway_through(monkeypatch):
    # The caller decides what a runaway means (analyze(): send the ayah to the teacher)
    def runaway(samples):
        raise whisper_quran.Runaway()

    monkeypatch.setattr(whisper_quran, "transcribe", runaway)
    with pytest.raises(whisper_quran.Runaway):
        whisper_quran.find_errors(None, IKHLAS_1)


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
    whisper_quran.load_model.cache_clear()  # load again, with the fake module
    yield calls
    whisper_quran.load_model.cache_clear()  # never keep the fake model for later tests


def test_load_model_uses_the_local_copy_of_the_pinned_revision(fake_transformers, tmp_path, monkeypatch):
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    folder = tmp_path / "tarteel-ai--whisper-base-ar-quran"
    folder.mkdir()
    (folder / "REVISION").write_text(whisper_quran.HF_REVISION, encoding="utf-8")

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

    pin = whisper_quran.HF_REVISION
    assert fake_transformers["processor"] == (whisper_quran.HF_REPO, {"revision": pin})
    assert fake_transformers["model"] == (whisper_quran.HF_REPO, {"revision": pin, "use_safetensors": False})
    assert whisper_quran.model_version().endswith("@" + pin[:12])
