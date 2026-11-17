# Merging the two models' findings (app/combine.py). Owner: Qussai.
# Rules: one finding per word by category priority (taxonomy 1.1); models disagree (taxonomy 4).
from app.combine import combine_findings
from app.policy import decide, make_finding


def finding(word, code, confidence=0.9):
    return make_finding(word, code, confidence, 0, 0)


def summary(findings):
    return [(f.wordIndex, f.code) for f in findings]


def test_no_findings_from_either_model_gives_none():
    assert combine_findings([], []) == []


def test_findings_on_different_words_are_all_kept_in_word_order():
    # muaalem also heard word 1 as wrong (a missing sound), so this is not a disagreement
    muaalem = [finding(1, "ERR_PRON_LETTER_SUB", 0.0), finding(3, "ERR_PRON_HARAKA")]
    whisper = [finding(1, "ERR_MEM_OMISSION")]

    assert summary(combine_findings(muaalem, whisper)) == [(1, "ERR_MEM_OMISSION"), (3, "ERR_PRON_HARAKA")]


def test_on_the_same_word_memorization_wins_over_pronunciation():
    muaalem = [finding(2, "ERR_PRON_LETTER_SUB")]
    whisper = [finding(2, "ERR_MEM_SUBSTITUTION")]

    assert summary(combine_findings(muaalem, whisper)) == [(2, "ERR_MEM_SUBSTITUTION")]


def test_on_the_same_word_memorization_wins_over_tajweed():
    muaalem = [finding(2, "ERR_TAJ_MADD_SHORT")]
    whisper = [finding(2, "ERR_MEM_OMISSION")]

    assert summary(combine_findings(muaalem, whisper)) == [(2, "ERR_MEM_OMISSION")]


def test_a_sound_error_only_muaalem_heard_is_kept_and_is_not_a_disagreement():
    muaalem = [finding(2, "ERR_TAJ_QALQALA_OMIT")]

    assert summary(combine_findings(muaalem, [])) == [(2, "ERR_TAJ_QALQALA_OMIT")]


def test_a_skipped_word_muaalem_heard_fine_is_a_disagreement():
    whisper = [finding(3, "ERR_MEM_OMISSION", 0.8)]

    combined = combine_findings([], whisper)

    assert summary(combined) == [(3, "ERR_TECH_MODELS_DISAGREE")]
    assert combined[0].confidence == 0.8  # whisper's confidence
    assert combined[0].category == "technical"


def test_a_different_word_muaalem_heard_fine_is_a_disagreement():
    muaalem = [finding(1, "ERR_PRON_HARAKA")]  # another word, so word 3 was heard fine
    whisper = [finding(3, "ERR_MEM_SUBSTITUTION")]

    assert summary(combine_findings(muaalem, whisper)) == [(1, "ERR_PRON_HARAKA"), (3, "ERR_TECH_MODELS_DISAGREE")]


def test_an_extra_word_is_not_a_disagreement():
    # muaalem cannot hear a word that is not in the ayah
    whisper = [finding(2, "ERR_MEM_INSERTION")]

    assert summary(combine_findings([], whisper)) == [(2, "ERR_MEM_INSERTION")]


def test_a_disagreement_makes_the_ayah_uncertain_at_every_level():
    combined = combine_findings([], [finding(3, "ERR_MEM_SUBSTITUTION", 0.99)])

    for level in ["beginner", "intermediate", "advanced"]:
        decision, _ = decide(combined, level)
        assert decision == "uncertain"


def test_the_order_of_the_input_does_not_change_the_result():
    muaalem = [finding(1, "ERR_PRON_HARAKA"), finding(4, "ERR_TAJ_MADD_SHORT")]
    whisper = [finding(2, "ERR_MEM_INSERTION"), finding(4, "ERR_MEM_OMISSION")]

    forward = combine_findings(muaalem, whisper)
    backward = combine_findings(list(reversed(muaalem)), list(reversed(whisper)))

    assert forward == backward
    assert summary(forward) == [(1, "ERR_PRON_HARAKA"), (2, "ERR_MEM_INSERTION"), (4, "ERR_MEM_OMISSION")]
