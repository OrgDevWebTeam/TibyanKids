# The real check (app/pipeline.py) with fake models and a fake gate.
import json
import logging
from types import SimpleNamespace

import pytest

from app import pipeline
from app.audio import AudioError
from app.policy import make_finding

ATTEMPT = "attempt-1"


class Runaway(Exception):
    """Stands in for whisper-quran's Runaway."""
    pass


def fake_model(name, findings=None, error=None):
    """An adapter with the same names as the real ones: NAME, model_version(), find_errors(), Runaway."""

    def find_errors(samples, reference):
        """Returns the findings, or raises the error."""
        if error is not None:
            raise error
        return findings or []

    return SimpleNamespace(NAME=name, model_version=lambda: "v1", find_errors=find_errors, Runaway=Runaway)


@pytest.fixture(autouse=True)
def fake_audio(monkeypatch):
    """Decoding and the gate replaced: every recording passes."""
    monkeypatch.setattr(pipeline, "decode_audio", lambda audio_bytes: "samples")
    monkeypatch.setattr(pipeline, "check_quality", lambda samples: ("ok", {"snrDb": 30.0}, "clip"))
    monkeypatch.delenv("CONFIDENCE_THRESHOLD", raising=False)


def use_models(monkeypatch, muaalem_model=None, whisper_model=None):
    """Fake models in the pipeline."""
    monkeypatch.setattr(pipeline, "muaalem", muaalem_model or fake_model("quran-muaalem"))
    monkeypatch.setattr(pipeline, "whisper_quran", whisper_model or fake_model("whisper-quran"))
    monkeypatch.setattr(pipeline, "models_loaded", True)


def test_no_findings_is_accepted_with_both_model_versions(monkeypatch):
    """No findings is accepted with both model versions."""
    use_models(monkeypatch)

    result = pipeline.analyze_recording(b"audio", 1, 1, "beginner", ATTEMPT)

    assert (result.decision, result.quality, result.findings) == ("accepted", "ok", [])
    assert result.model == "combined"
    assert result.modelVersion == "quran-muaalem v1 + whisper-quran v1"
    assert result.attemptId == ATTEMPT


def test_a_wrong_word_is_an_error_with_the_segment_of_that_word(monkeypatch):
    """A wrong word is an error with the segment of that word."""
    whisper = fake_model("whisper-quran", [make_finding(2, "ERR_MEM_SUBSTITUTION", 0.9, 0, 0)])
    muaalem = fake_model("quran-muaalem", [make_finding(2, "ERR_PRON_LETTER_SUB", 0.9, 0, 0)])
    use_models(monkeypatch, muaalem, whisper)

    result = pipeline.analyze_recording(b"audio", 1, 1, "beginner", ATTEMPT)

    assert result.decision == "error"
    assert [(f.wordIndex, f.code, f.wordStartMs, f.wordEndMs) for f in result.findings] == [
        (2, "ERR_MEM_SUBSTITUTION", 520, 1240)
    ]


def test_the_level_decides_what_stops_the_child(monkeypatch):
    """The level decides what stops the child."""
    use_models(monkeypatch, fake_model("quran-muaalem", [make_finding(3, "ERR_PRON_HARAKA", 0.9, 0, 0)]))

    assert pipeline.analyze_recording(b"audio", 1, 1, "beginner", ATTEMPT).decision == "accepted"
    assert pipeline.analyze_recording(b"audio", 1, 1, "intermediate", ATTEMPT).decision == "error"


def test_a_gate_rejection_never_reaches_the_models(monkeypatch):
    """A gate rejection never reaches the models."""
    monkeypatch.setattr(pipeline, "check_quality", lambda samples: ("silent", {"speechSeconds": 0.0}, None))
    broken = fake_model("quran-muaalem", error=AssertionError("the models must not run"))
    use_models(monkeypatch, broken, broken)

    result = pipeline.analyze_recording(b"audio", 1, 1, "beginner", ATTEMPT)

    assert (result.decision, result.quality, result.findings) == ("uncertain", "silent", [])


def test_the_gate_and_the_models_run_inside_the_lock(monkeypatch):
    """The gate and the models run inside the lock."""
    def gate(samples):
        """A gate that checks the lock is held."""
        assert pipeline.MODELS_LOCK.locked()
        return "ok", {}, "clip"

    def find_errors(samples, reference):
        """A model that checks the lock is held."""
        assert pipeline.MODELS_LOCK.locked()
        return []

    monkeypatch.setattr(pipeline, "check_quality", gate)
    model = SimpleNamespace(NAME="m", model_version=lambda: "v1", find_errors=find_errors, Runaway=Runaway)
    use_models(monkeypatch, model, model)

    pipeline.analyze_recording(b"audio", 1, 1, "beginner", ATTEMPT)
    assert not pipeline.MODELS_LOCK.locked()


def test_unreadable_audio_raises_its_audio_error(monkeypatch):
    """Unreadable audio raises its audio error."""
    def broken_decode(audio_bytes):
        """Unreadable audio."""
        raise AudioError("DECODE_FAILED", "The file is not readable audio")

    monkeypatch.setattr(pipeline, "decode_audio", broken_decode)
    use_models(monkeypatch)

    with pytest.raises(AudioError):
        pipeline.analyze_recording(b"audio", 1, 1, "beginner", ATTEMPT)


def test_a_whisper_runaway_is_uncertain_with_no_findings(monkeypatch):
    """A whisper runaway is uncertain with no findings."""
    muaalem = fake_model("quran-muaalem", [make_finding(1, "ERR_PRON_HARAKA", 0.9, 0, 0)])
    use_models(monkeypatch, muaalem, fake_model("whisper-quran", error=Runaway()))

    result = pipeline.analyze_recording(b"audio", 1, 1, "beginner", ATTEMPT)

    assert (result.decision, result.quality, result.findings) == ("uncertain", "ok", [])


@pytest.mark.parametrize("failing", ["quran-muaalem", "whisper-quran"])
def test_a_model_crash_raises_model_failed(monkeypatch, failing):
    """A model crash raises model failed."""
    crash = RuntimeError("CUDA error")
    muaalem = fake_model("quran-muaalem", error=crash if failing == "quran-muaalem" else None)
    whisper = fake_model("whisper-quran", error=crash if failing == "whisper-quran" else None)
    use_models(monkeypatch, muaalem, whisper)

    with pytest.raises(pipeline.ModelFailed) as raised:
        pipeline.analyze_recording(b"audio", 1, 1, "beginner", ATTEMPT)
    assert raised.value.model_name == failing


def test_one_json_log_line_with_numbers_and_codes_only(monkeypatch, caplog):
    """One json log line with numbers and codes only."""
    whisper = fake_model("whisper-quran", [make_finding(4, "ERR_MEM_OMISSION", 0.3, 0, 0)])
    unsure = make_finding(4, "ERR_PRON_LETTER_SUB", 0.0, 0, 0)
    use_models(monkeypatch, fake_model("quran-muaalem", [unsure]), whisper)

    with caplog.at_level(logging.INFO, logger="tibyan.ai"):
        pipeline.analyze_recording(b"audio", 1, 1, "beginner", ATTEMPT)

    assert len(caplog.records) == 1
    entry = json.loads(caplog.records[0].getMessage())
    assert entry["attemptId"] == ATTEMPT
    assert (entry["surah"], entry["ayah"], entry["level"]) == (1, 1, "beginner")
    assert (entry["quality"], entry["gate"]) == ("ok", {"snrDb": 30.0})
    assert entry["models"] == {"quran-muaalem": "ok", "whisper-quran": "ok"}
    assert set(entry["ms"]) == {"decode", "gate", "quran-muaalem", "whisper-quran", "total"}
    assert entry["decision"] == "uncertain"
    assert entry["findings"] == [{"code": "ERR_MEM_OMISSION", "wordIndex": 4, "confidence": 0.3}]


def test_a_failed_request_is_logged_too(monkeypatch, caplog):
    """A failed request is logged too."""
    use_models(monkeypatch, fake_model("quran-muaalem", error=RuntimeError("CUDA error")))

    with caplog.at_level(logging.INFO, logger="tibyan.ai"), pytest.raises(pipeline.ModelFailed):
        pipeline.analyze_recording(b"audio", 1, 1, "beginner", ATTEMPT)

    entry = json.loads(caplog.records[0].getMessage())
    assert entry["error"] == "MODEL_FAILED"
    assert entry["models"] == {"quran-muaalem": "error"}


def test_no_models_listed_before_they_are_loaded(monkeypatch):
    """No models listed before they are loaded."""
    monkeypatch.setattr(pipeline, "models_loaded", False)

    assert pipeline.model_versions() == []
