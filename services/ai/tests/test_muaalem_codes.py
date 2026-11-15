# How quran-muaalem's errors become our codes (app/adapters/muaalem.py error_code()). Owner: Qussai.
# Mapping table: docs/ai/tajweed_taxonomy_and_feedback.md, section 1.4.
#
# Needs the GPU packages (quran-muaalem, quran-transcript), so it runs on the GPU machine and is
# skipped in CI. No model is loaded and no audio is used: the errors are built by hand.
from types import SimpleNamespace

import pytest

pytest.importorskip("quran_muaalem")

from quran_transcript.phonetics.tajweed_rulses import (  # noqa: E402
    AaredMaddRule,
    Ghonnah,
    MaddRule,
    MoshaddadOrModghamNoonRule,
    NormalMaddRule,
    Qalqalah,
)

from app.adapters.muaalem import error_code  # noqa: E402


def rule(cls):
    # error_code() only asks which kind of rule it is, so the rule's own settings do not matter
    return cls.__new__(cls)


def error(error_type, rules=(), predicted_len=None, expected_len=None):
    return SimpleNamespace(
        error_type=error_type, ref_tajweed_rules=list(rules), predicted_len=predicted_len, expected_len=expected_len
    )


def test_a_letter_said_as_another_is_a_pronunciation_error():
    assert error_code(error("normal")) == "ERR_PRON_LETTER_SUB"


def test_a_wrong_vowel_is_a_haraka_error():
    assert error_code(error("tashkeel")) == "ERR_PRON_HARAKA"


def test_a_tajweed_error_without_a_known_rule_goes_to_the_teacher():
    assert error_code(error("tajweed")) == "ERR_TAJ_UNMAPPED"


def test_qalqala():
    assert error_code(error("tajweed", [rule(Qalqalah)])) == "ERR_TAJ_QALQALA_OMIT"


def test_ghunna_rules_are_ghunna_even_though_one_is_a_madd_subclass():
    # The trap: in quran_transcript this ghunna rule is a subclass of MaddRule
    assert issubclass(MoshaddadOrModghamNoonRule, MaddRule)
    assert error_code(error("tajweed", [rule(MoshaddadOrModghamNoonRule)], 2, 4)) == "ERR_TAJ_GHONNA_OMIT"
    assert error_code(error("tajweed", [rule(Ghonnah)])) == "ERR_TAJ_GHONNA_OMIT"


def test_a_madd_held_too_short():
    assert error_code(error("tajweed", [rule(NormalMaddRule)], predicted_len=1, expected_len=2)) == "ERR_TAJ_MADD_SHORT"


def test_a_madd_held_too_long_goes_to_the_teacher():
    assert error_code(error("tajweed", [rule(NormalMaddRule)], predicted_len=6, expected_len=2)) == "ERR_TAJ_UNMAPPED"


@pytest.mark.parametrize("counts", [2, 3, 4, 6])
def test_a_madd_before_a_pause_is_accepted_from_two_counts(counts):
    assert error_code(error("tajweed", [rule(AaredMaddRule)], predicted_len=counts, expected_len=4)) is None


def test_a_madd_before_a_pause_held_under_two_counts_is_too_short():
    assert error_code(error("tajweed", [rule(AaredMaddRule)], predicted_len=1, expected_len=2)) == "ERR_TAJ_MADD_SHORT"


def test_any_other_rule_goes_to_the_teacher():
    class SomeOtherRule:
        pass

    assert error_code(error("tajweed", [SomeOtherRule()])) == "ERR_TAJ_UNMAPPED"
