# Decision policy v0: turns findings into accepted / error / uncertain (CRS 5.4).
import os

from app.schemas import Finding

POLICY_VERSION = "v0"
DEFAULT_THRESHOLD = 0.95

CODES = {
    "ERR_MEM_OMISSION": ("memorization", "FEEDBACK_WORD_MISSED"),
    "ERR_MEM_SUBSTITUTION": ("memorization", "FEEDBACK_WORD_DIFFERENT"),
    "ERR_MEM_INSERTION": ("memorization", "FEEDBACK_WORD_DIFFERENT"),
    "ERR_PRON_LETTER_SUB": ("pronunciation", "FEEDBACK_LISTEN_AND_REPEAT_WORD"),
    "ERR_PRON_HARAKA": ("pronunciation", "FEEDBACK_CHECK_HARAKA"),
    "ERR_PRON_MADD_ASLI_SHORT": ("pronunciation", "FEEDBACK_LISTEN_AND_REPEAT_WORD"),
    "ERR_TAJ_MADD_SHORT": ("tajweed", "FEEDBACK_MADD_REMINDER"),
    "ERR_TAJ_GHONNA_OMIT": ("tajweed", "FEEDBACK_GHUNNA_REMINDER"),
    "ERR_TAJ_QALQALA_OMIT": ("tajweed", "FEEDBACK_QALQALA_REMINDER"),
    "ERR_TAJ_UNMAPPED": ("tajweed", "FEEDBACK_TEACHER_REVIEW"),
    "ERR_TECH_MODELS_DISAGREE": ("technical", "FEEDBACK_TEACHER_REVIEW"),
}

CATEGORY_ORDER = ["memorization", "pronunciation", "tajweed", "technical"]
ALWAYS_UNCERTAIN = {"ERR_TAJ_UNMAPPED", "ERR_TECH_MODELS_DISAGREE"}
NOT_YET_APPROVED = {"ERR_MEM_INSERTION", "ERR_PRON_MADD_ASLI_SHORT", "ERR_TAJ_GHONNA_OMIT", "ERR_TAJ_MADD_SHORT"}

STOPS = {
    "beginner": {"memorization"},
    "intermediate": {"memorization", "pronunciation"},
    "advanced": {"memorization", "pronunciation"},
}


def confidence_threshold():
    """The threshold from CONFIDENCE_THRESHOLD, read on every call."""
    return float(os.environ.get("CONFIDENCE_THRESHOLD", DEFAULT_THRESHOLD))


def make_finding(word_index, code, confidence, word_start_ms, word_end_ms):
    """A finding with the category and message that belong to the code."""
    category, message_key = CODES[code]
    return Finding(
        wordIndex=word_index,
        category=category,
        code=code,
        confidence=confidence,
        wordStartMs=word_start_ms,
        wordEndMs=word_end_ms,
        messageKey=message_key,
    )


def stops_child(finding, level, targeted_tajweed_codes=()):
    """True when this finding stops the child at this level."""
    if finding.code in NOT_YET_APPROVED:
        return False
    if finding.category in STOPS[level]:
        return True
    return level == "advanced" and finding.code in targeted_tajweed_codes


def decide(findings, level, targeted_tajweed_codes=(), threshold=None):
    """(decision, findings) at this level; threshold None means CONFIDENCE_THRESHOLD."""
    if threshold is None:
        threshold = confidence_threshold()
    unsure = [f for f in findings if f.confidence < threshold or f.code in ALWAYS_UNCERTAIN]

    if unsure:
        teacher = [f.model_copy(update={"messageKey": "FEEDBACK_TEACHER_REVIEW"}) for f in findings]
        return "uncertain", teacher

    if any(stops_child(f, level, targeted_tajweed_codes) for f in findings):
        return "error", findings

    return "accepted", findings
