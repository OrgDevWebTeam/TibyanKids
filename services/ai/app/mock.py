# Fake results for MOCK_MODE, so developers can test every path without a GPU. Owner: Qussai.
#
# Rules (always the same for the same input):
#   audio smaller than 1 KB  -> quality "too_short" (not an attempt)
#   ayah % 5 == 0            -> word 1 skipped with low confidence (0.4) -> "uncertain"
#   ayah % 3 == 0            -> word 1 read as a different word (0.92)  -> "error" at every level
#   anything else            -> "accepted"
# So: ayah 1, 2, 4 accepted · ayah 3, 6, 9 error · ayah 5, 10, 15 uncertain.
# The decision comes from the real decision policy, so the mock follows the same rules, and the
# replay segment of word 1 comes from the real word timings.
from app.policy import decide, make_finding
from app.reference import add_word_segments, get_word_timings
from app.schemas import AnalysisResult

MOCK_MODEL = "mock"
MOCK_VERSION = "0.3"  # 0.3: real word segments from reference_word_timings.json
MIN_AUDIO_BYTES = 1024


def _result(attempt_id, decision, quality="ok", findings=None, processing_ms=0):
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

