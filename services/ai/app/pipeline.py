# The real recitation check: one recording of one ayah -> one contract result. Owner: Qussai.
# Used by app/main.py when MOCK_MODE=false. The steps (services/ai/README.md, "How it works"):
#   1. decode_audio()     any upload -> 16 kHz mono samples
#   2. check_quality()    a rejected recording never reaches the models (not an attempt)
#   3. both models        find_errors() of each adapter
#   4. combine_findings(), add_word_segments(), decide()
# Steps 2 and 3 run one request at a time (MODELS_LOCK).
#
# Failures (decided in W3-4):
#   unreadable audio  -> AudioError (main.py answers 400 with its code)
#   whisper Runaway   -> "uncertain" with no findings: its text cannot be trusted, the teacher checks
#   any model crash   -> ModelFailed (main.py answers 500 MODEL_FAILED; the API saves "uncertain")
#
# Every request writes one JSON log line (docs/ai/audio-io-and-eval-dataset.md, A.4): numbers and
# codes only. Never audio, transcripts, phonemes or names.
import json
import logging
import threading
import time

from app.audio import AudioError, check_quality, decode_audio
from app.combine import combine_findings
from app.policy import decide
from app.reference import add_word_segments, get_ayah, get_word_timings
from app.schemas import AnalysisResult

COMBINED_MODEL = "combined"  # AnalysisResult.model for a result of both models

log = logging.getLogger("noor.ai")

# The GPU machine checks one recording at a time (Architecture v3.0, section 2): the quality gate
# and both models. Other requests wait here; the child sees "checking...". /health does not use
# the lock, so it still answers.
MODELS_LOCK = threading.Lock()

# The two adapters, set by load_models(). They import torch and the model packages, which are only
# installed on the GPU machine, so they are imported there and not when this file is loaded.
muaalem = None
whisper_quran = None


class ModelFailed(Exception):
    """A model raised an unexpected error. The API's fallback marks the ayah uncertain."""

    def __init__(self, model_name):
        super().__init__(f"{model_name} failed")
        self.model_name = model_name


def load_models():
    """Loads both models (about 10 s). Called once when the service starts with MOCK_MODE=false."""
    global muaalem, whisper_quran
    from app.adapters import muaalem as muaalem_adapter
    from app.adapters import whisper_quran as whisper_quran_adapter

    muaalem_adapter.load_model()
    whisper_quran_adapter.load_model()
    muaalem = muaalem_adapter
    whisper_quran = whisper_quran_adapter


def model_versions():
    """The loaded models for /health: [{"name", "version"}], empty before load_models()."""
    if muaalem is None or whisper_quran is None:
        return []
    return [
        {"name": muaalem.NAME, "version": muaalem.model_version()},
        {"name": whisper_quran.NAME, "version": whisper_quran.model_version()},
    ]


def combined_version():
    # Both exact versions (OPS-008), e.g. "quran-muaalem 0.3.0 obadx/...@01a1ef9fbe40 + whisper-quran ..."
    return " + ".join(f"{model['name']} {model['version']}" for model in model_versions())


def elapsed_ms(started):
    return int((time.perf_counter() - started) * 1000)


def analyze_recording(audio_bytes, surah, ayah, level, attempt_id):
    """
    Checks one recording of one prototype ayah (main.py rejects other ayat first) for the child's
    level, and returns one AnalysisResult. Raises AudioError or ModelFailed (see the top of the file).
    """
    started = time.perf_counter()
    log_entry = {"attemptId": attempt_id, "surah": surah, "ayah": ayah, "level": level, "ms": {}, "models": {}}
    try:
        quality, decision, findings = check_recording(audio_bytes, surah, ayah, level, log_entry)
    except AudioError as error:
        log_entry["error"] = error.code
        raise
    except ModelFailed:
        log_entry["error"] = "MODEL_FAILED"
        raise
    finally:
        # Written for every request, also when it fails
        log_entry["ms"]["total"] = elapsed_ms(started)
        log.info(json.dumps(log_entry))

    return AnalysisResult(
        attemptId=attempt_id,
        model=COMBINED_MODEL,
        modelVersion=combined_version(),
        decision=decision,
        quality=quality,
        findings=findings,
        processingMs=elapsed_ms(started),
    )


def check_recording(audio_bytes, surah, ayah, level, log_entry):
    """Steps 1-4. Returns (quality, decision, findings) and fills log_entry as it goes."""
    reference_ayah = get_ayah(surah, ayah)

    # 1. Decode
    stage_started = time.perf_counter()
    samples = decode_audio(audio_bytes)
    log_entry["ms"]["decode"] = elapsed_ms(stage_started)

    # Steps 2 and 3 use torch models, one request at a time. The gate's speech check (Silero VAD)
    # keeps state inside the model: two requests at once corrupted it and crashed the service.
    with MODELS_LOCK:
        # 2. Quality gate
        stage_started = time.perf_counter()
        quality, report, clip = check_quality(samples)
        log_entry["ms"]["gate"] = elapsed_ms(stage_started)
        log_entry["quality"] = quality
        log_entry["gate"] = report
        if quality != "ok":
            # Not an attempt: the child records again (contract: uncertain, no findings)
            log_entry["decision"] = "uncertain"
            return quality, "uncertain", []

        # 3. Both models
        stage_started = time.perf_counter()
        try:
            muaalem_findings = muaalem.find_errors(clip, reference_ayah["text_uthmani"])
        except Exception as error:
            log_entry["models"][muaalem.NAME] = "error"
            raise ModelFailed(muaalem.NAME) from error
        log_entry["ms"][muaalem.NAME] = elapsed_ms(stage_started)
        log_entry["models"][muaalem.NAME] = "ok"

        stage_started = time.perf_counter()
        words = [word["text_imlaei"] for word in reference_ayah["words"]]
        try:
            whisper_findings = whisper_quran.find_errors(clip, words)
        except whisper_quran.Runaway:
            # The text is a loop, not what the child said: the teacher checks the ayah (FR-QUR-006)
            log_entry["models"][whisper_quran.NAME] = "runaway"
            log_entry["decision"] = "uncertain"
            return "ok", "uncertain", []
        except Exception as error:
            log_entry["models"][whisper_quran.NAME] = "error"
            raise ModelFailed(whisper_quran.NAME) from error
        log_entry["ms"][whisper_quran.NAME] = elapsed_ms(stage_started)
        log_entry["models"][whisper_quran.NAME] = "ok"

    # 4. One list of findings, the word segments to replay, one decision.
    # No targeted tajweed rules per lesson yet (taxonomy 2.1), so advanced stops on the same
    # categories as intermediate for now.
    findings = combine_findings(muaalem_findings, whisper_findings)
    findings = add_word_segments(findings, get_word_timings(surah, ayah))
    decision, findings = decide(findings, level)

    log_entry["decision"] = decision
    log_entry["findings"] = [
        {"code": finding.code, "wordIndex": finding.wordIndex, "confidence": finding.confidence}
        for finding in findings
    ]
    return quality, decision, findings
