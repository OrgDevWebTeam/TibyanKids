# Fake but rule-following results for MOCK_MODE: ayah % 5 uncertain, ayah % 3 error, else accepted.
from app.policy import decide, make_finding
from app.reference import add_word_segments, get_word_timings
from app.schemas import AnalysisResult

MOCK_MODEL = "mock"
MOCK_VERSION = "0.3"
MIN_AUDIO_BYTES = 1024


def _result(attempt_id, decision, quality="ok", findings=None, processing_ms=0):
    """One mock AnalysisResult."""
    return AnalysisResult(
        attemptId=attempt_id,
        model=MOCK_MODEL,
        modelVersion=MOCK_VERSION,
        decision=decision,
        quality=quality,
        findings=findings or [],
        processingMs=processing_ms,
    )


def mock_recitation(attempt_id, audio_size, surah, ayah, level="beginner", processing_ms=0):
    """The same result for the same input, decided by the real policy with real word segments."""
    if audio_size < MIN_AUDIO_BYTES:
        return _result(attempt_id, "uncertain", quality="too_short", processing_ms=processing_ms)

    if ayah % 5 == 0:
        findings = [make_finding(1, "ERR_MEM_OMISSION", 0.4, 0, 0)]
    elif ayah % 3 == 0:
        findings = [make_finding(1, "ERR_MEM_SUBSTITUTION", 0.92, 0, 0)]
    else:
        findings = []

    findings = add_word_segments(findings, get_word_timings(surah, ayah))
    decision, findings = decide(findings, level)
    return _result(attempt_id, decision, findings=findings, processing_ms=processing_ms)
