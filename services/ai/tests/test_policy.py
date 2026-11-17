# The decision rules (app/policy.py).
import pytest

from app.policy import CODES, DEFAULT_THRESHOLD, decide, make_finding

SURE = 0.95
UNSURE = 0.40


def finding(code, confidence=SURE, word=1):
    return make_finding(word, code, confidence, 0, 600)


@pytest.fixture(autouse=True)
def default_threshold(monkeypatch):
    monkeypatch.delenv("CONFIDENCE_THRESHOLD", raising=False)


@pytest.mark.parametrize("code", list(CODES))
def test_make_finding_takes_category_and_message_from_the_code(code):
    category, message_key = CODES[code]
    made = finding(code)
    assert made.category == category
    assert made.messageKey == message_key


def test_no_findings_is_accepted():
    assert decide([], "beginner") == ("accepted", [])


def test_a_finding_below_the_threshold_makes_the_ayah_uncertain():
    decision, _ = decide([finding("ERR_MEM_OMISSION", UNSURE)], "beginner")
    assert decision == "uncertain"


def test_a_finding_exactly_at_the_threshold_is_trusted():
    decision, _ = decide([finding("ERR_MEM_OMISSION", DEFAULT_THRESHOLD)], "beginner")
    assert decision == "error"


def test_uncertain_gives_every_finding_the_teacher_message():
    findings = [finding("ERR_MEM_OMISSION", UNSURE, word=1), finding("ERR_MEM_SUBSTITUTION", SURE, word=2)]
    decision, result = decide(findings, "beginner")
    assert decision == "uncertain"
    assert [f.messageKey for f in result] == ["FEEDBACK_TEACHER_REVIEW"] * 2
    assert [(f.wordIndex, f.code) for f in result] == [(1, "ERR_MEM_OMISSION"), (2, "ERR_MEM_SUBSTITUTION")]


@pytest.mark.parametrize("code", ["ERR_TAJ_UNMAPPED", "ERR_TECH_MODELS_DISAGREE"])
@pytest.mark.parametrize("level", ["beginner", "intermediate", "advanced"])
def test_some_codes_always_go_to_the_teacher(code, level):
    decision, _ = decide([finding(code, SURE)], level)
    assert decision == "uncertain"


@pytest.mark.parametrize(
    "code, level, expected",
    [
        ("ERR_MEM_OMISSION", "beginner", "error"),
        ("ERR_MEM_SUBSTITUTION", "beginner", "error"),
        ("ERR_PRON_LETTER_SUB", "beginner", "accepted"),
        ("ERR_PRON_HARAKA", "beginner", "accepted"),
        ("ERR_TAJ_MADD_SHORT", "beginner", "accepted"),
        ("ERR_MEM_OMISSION", "intermediate", "error"),
        ("ERR_PRON_LETTER_SUB", "intermediate", "error"),
        ("ERR_PRON_HARAKA", "intermediate", "error"),
        ("ERR_TAJ_MADD_SHORT", "intermediate", "accepted"),
        ("ERR_TAJ_QALQALA_OMIT", "intermediate", "accepted"),
        ("ERR_MEM_OMISSION", "advanced", "error"),
        ("ERR_PRON_HARAKA", "advanced", "error"),
        ("ERR_TAJ_MADD_SHORT", "advanced", "accepted"),
    ],
)
def test_what_stops_each_level(code, level, expected):
    decision, _ = decide([finding(code)], level)
    assert decision == expected


def test_advanced_stops_on_a_tajweed_rule_targeted_in_the_lesson():
    targeted = ("ERR_TAJ_MADD_SHORT",)
    assert decide([finding("ERR_TAJ_MADD_SHORT")], "advanced", targeted)[0] == "error"
    assert decide([finding("ERR_TAJ_QALQALA_OMIT")], "advanced", targeted)[0] == "accepted"


def test_targeted_tajweed_rules_do_not_stop_lower_levels():
    targeted = ("ERR_TAJ_MADD_SHORT",)
    assert decide([finding("ERR_TAJ_MADD_SHORT")], "intermediate", targeted)[0] == "accepted"


@pytest.mark.parametrize("code", ["ERR_MEM_INSERTION", "ERR_PRON_MADD_ASLI_SHORT", "ERR_TAJ_GHONNA_OMIT"])
def test_proposed_codes_never_stop_a_child(code):
    assert decide([finding(code)], "advanced", (code,))[0] == "accepted"


def test_accepted_keeps_findings_as_notes_with_their_own_message():
    decision, result = decide([finding("ERR_TAJ_MADD_SHORT")], "beginner")
    assert decision == "accepted"
    assert [f.messageKey for f in result] == ["FEEDBACK_MADD_REMINDER"]


def test_the_threshold_comes_from_the_setting(monkeypatch):
    monkeypatch.setenv("CONFIDENCE_THRESHOLD", "0.30")
    assert decide([finding("ERR_MEM_OMISSION", UNSURE)], "beginner")[0] == "error"
    monkeypatch.setenv("CONFIDENCE_THRESHOLD", "0.99")
    assert decide([finding("ERR_MEM_OMISSION", SURE)], "beginner")[0] == "uncertain"
