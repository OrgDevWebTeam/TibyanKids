# The real check of one recorded ayah: decode, gate, both models, word segments, Whisper's decision (OD-02).
import json
import logging
import threading
import time

from app.adapters import muaalem, whisper_quran
from app.audio import AudioError, check_quality, decode_audio
from app.policy import decide
from app.reference import add_word_segments, get_ayah, get_word_timings
from app.schemas import AnalysisResult

log = logging.getLogger("tibyan.ai")

MODELS_LOCK = threading.Lock()

models_loaded = False


class ModelFailed(Exception):
    """A model raised an unexpected error; the API's fallback marks the ayah uncertain."""

    def __init__(self, model_name):
        """Keeps the name of the model that failed."""
        super().__init__(f"{model_name} failed")
        self.model_name = model_name


def load_models():
    """Loads both models once, when the service starts with MOCK_MODE=false."""
    global models_loaded
    muaalem.load_model()
    whisper_quran.load_model()
    models_loaded = True


def model_versions():
    """[{"name", "version"}] of the loaded models for /health; empty before load_models()."""
    if not models_loaded:
        return []
    return [
        {"name": muaalem.NAME, "version": muaalem.model_version()},
        {"name": whisper_quran.NAME, "version": whisper_quran.model_version()},
    ]


def analyze_recording(audio_bytes, surah, ayah, level, attempt_id):
    """One AnalysisResult for a prototype ayah; raises AudioError or ModelFailed; logs one JSON line."""
    started = time.perf_counter()
    log_entry = {"attemptId": attempt_id, "surah": surah, "ayah": ayah, "level": level}
    log_entry.update({"ms": {}, "models": {}})
    try:
        quality, decision, findings = check_recording(audio_bytes, surah, ayah, level, log_entry)
    except AudioError as error:
        log_entry["error"] = error.code
        raise
    except ModelFailed:
        log_entry["error"] = "MODEL_FAILED"
        raise
    finally:
        log_entry["ms"]["total"] = int((time.perf_counter() - started) * 1000)
        log.info(json.dumps(log_entry))

    return AnalysisResult(
        attemptId=attempt_id,
        model=whisper_quran.NAME,
        modelVersion=" + ".join(f"{model['name']} {model['version']}" for model in model_versions()),
        decision=decision,
        quality=quality,
        findings=findings,
        processingMs=int((time.perf_counter() - started) * 1000),
    )


def logged_findings(findings):
    """Code, word and confidence of each finding, for the log line."""
    return [
        {"code": finding.code, "wordIndex": finding.wordIndex, "confidence": finding.confidence}
        for finding in findings
    ]


def check_recording(audio_bytes, surah, ayah, level, log_entry):
    """(quality, decision, findings) for one recording; fills log_entry with numbers and codes only."""
    reference_ayah = get_ayah(surah, ayah)

    stage_started = time.perf_counter()
    samples = decode_audio(audio_bytes)
    log_entry["ms"]["decode"] = int((time.perf_counter() - stage_started) * 1000)

    with MODELS_LOCK:
        stage_started = time.perf_counter()
        quality, report, clip = check_quality(samples)
        log_entry["ms"]["gate"] = int((time.perf_counter() - stage_started) * 1000)
        log_entry["quality"] = quality
        log_entry["gate"] = report
        if quality != "ok":
            log_entry["decision"] = "uncertain"
            return quality, "uncertain", []

        stage_started = time.perf_counter()
        try:
            muaalem_findings = muaalem.find_errors(clip, reference_ayah["text_uthmani"])
        except Exception as error:
            log_entry["models"][muaalem.NAME] = "error"
            raise ModelFailed(muaalem.NAME) from error
        log_entry["ms"][muaalem.NAME] = int((time.perf_counter() - stage_started) * 1000)
        log_entry["models"][muaalem.NAME] = "ok"

        stage_started = time.perf_counter()
        words = [word["text_imlaei"] for word in reference_ayah["words"]]
        try:
            whisper_findings = whisper_quran.find_errors(clip, words)
        except whisper_quran.Runaway:
            log_entry["models"][whisper_quran.NAME] = "runaway"
            log_entry["decision"] = "uncertain"
            return "ok", "uncertain", []
        except Exception as error:
            log_entry["models"][whisper_quran.NAME] = "error"
            raise ModelFailed(whisper_quran.NAME) from error
        log_entry["ms"][whisper_quran.NAME] = int((time.perf_counter() - stage_started) * 1000)
        log_entry["models"][whisper_quran.NAME] = "ok"

    findings = add_word_segments(whisper_findings, get_word_timings(surah, ayah))
    decision, findings = decide(findings, level)

    log_entry["decision"] = decision
    log_entry["findings"] = logged_findings(findings)
    log_entry["muaalemFindings"] = logged_findings(muaalem_findings)
    return quality, decision, findings
