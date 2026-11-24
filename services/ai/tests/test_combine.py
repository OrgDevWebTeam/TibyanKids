# Merging the two models' findings (app/combine.py).
from app.combine import combine_findings
from app.policy import decide, make_finding


def finding(word, code, confidence=0.9):
    """A finding of this code on this word."""
    return make_finding(word, code, confidence, 0, 0)


def test_no_findings_from_either_model_gives_none():
    """No findings from either model gives none."""
    assert combine_findings([], []) == []


def test_findings_on_different_words_are_all_kept_in_word_order():
    """Findings on different words are all kept in word order."""
    muaalem = [finding(1, "ERR_PRON_LETTER_SUB", 0.0), finding(3, "ERR_PRON_HARAKA")]
    whisper = [finding(1, "ERR_MEM_OMISSION")]

    pairs = [(f.wordIndex, f.code) for f in combine_findings(muaalem, whisper)]
    assert pairs == [(1, "ERR_MEM_OMISSION"), (3, "ERR_PRON_HARAKA")]


def test_on_the_same_word_memorization_wins_over_pronunciation():
    """On the same word memorization wins over pronunciation."""
    muaalem = [finding(2, "ERR_PRON_LETTER_SUB")]
    whisper = [finding(2, "ERR_MEM_SUBSTITUTION")]

    pairs = [(f.wordIndex, f.code) for f in combine_findings(muaalem, whisper)]
    assert pairs == [(2, "ERR_MEM_SUBSTITUTION")]


def test_on_the_same_word_memorization_wins_over_tajweed():
    """On the same word memorization wins over tajweed."""
    muaalem = [finding(2, "ERR_TAJ_MADD_SHORT")]
    whisper = [finding(2, "ERR_MEM_OMISSION")]

    assert [(f.wordIndex, f.code) for f in combine_findings(muaalem, whisper)] == [(2, "ERR_MEM_OMISSION")]


def test_a_sound_error_only_muaalem_heard_is_kept_and_is_not_a_disagreement():
    """A sound error only muaalem heard is kept and is not a disagreement."""
    muaalem = [finding(2, "ERR_TAJ_QALQALA_OMIT")]

    assert [(f.wordIndex, f.code) for f in combine_findings(muaalem, [])] == [(2, "ERR_TAJ_QALQALA_OMIT")]


def test_a_skipped_word_muaalem_heard_fine_is_a_disagreement():
    """A skipped word muaalem heard fine is a disagreement."""
    whisper = [finding(3, "ERR_MEM_OMISSION", 0.8)]

    combined = combine_findings([], whisper)

    assert [(f.wordIndex, f.code) for f in combined] == [(3, "ERR_TECH_MODELS_DISAGREE")]
    assert combined[0].confidence == 0.8
    assert combined[0].category == "technical"


def test_a_different_word_muaalem_heard_fine_is_a_disagreement():
    """A different word muaalem heard fine is a disagreement."""
    muaalem = [finding(1, "ERR_PRON_HARAKA")]
    whisper = [finding(3, "ERR_MEM_SUBSTITUTION")]

    expected = [(1, "ERR_PRON_HARAKA"), (3, "ERR_TECH_MODELS_DISAGREE")]
    assert [(f.wordIndex, f.code) for f in combine_findings(muaalem, whisper)] == expected


def test_an_extra_word_is_not_a_disagreement():
    """An extra word is not a disagreement."""
    whisper = [finding(2, "ERR_MEM_INSERTION")]

    assert [(f.wordIndex, f.code) for f in combine_findings([], whisper)] == [(2, "ERR_MEM_INSERTION")]


def test_a_disagreement_makes_the_ayah_uncertain_at_every_level():
    """A disagreement makes the ayah uncertain at every level."""
    combined = combine_findings([], [finding(3, "ERR_MEM_SUBSTITUTION", 0.99)])

    for level in ["beginner", "intermediate", "advanced"]:
        decision, _ = decide(combined, level)
        assert decision == "uncertain"


def test_the_order_of_the_input_does_not_change_the_result():
    """The order of the input does not change the result."""
    muaalem = [finding(1, "ERR_PRON_HARAKA"), finding(4, "ERR_TAJ_MADD_SHORT")]
    whisper = [finding(2, "ERR_MEM_INSERTION"), finding(4, "ERR_MEM_OMISSION")]

    forward = combine_findings(muaalem, whisper)
    backward = combine_findings(list(reversed(muaalem)), list(reversed(whisper)))

    assert forward == backward
    pairs = [(f.wordIndex, f.code) for f in forward]
    assert pairs == [(1, "ERR_PRON_HARAKA"), (2, "ERR_MEM_INSERTION"), (4, "ERR_MEM_OMISSION")]
