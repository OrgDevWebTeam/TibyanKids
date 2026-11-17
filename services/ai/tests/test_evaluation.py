# The evaluation numbers (app/evaluation.py) on synthetic labels, values worked out by hand.
import json

import pytest

from app import evaluation
from app.policy import make_finding

MODELS = ["combined"]


def label(recording_id, word, codes=(), annotator="TCH_A", round_number=1, decision=None):
    return {
        "recordingId": recording_id,
        "wordIndex": word,
        "annotatorId": annotator,
        "round": round_number,
        "teacherDecision": decision or ("needs_practice" if codes else "correct"),
        "errorCodes": list(codes),
        "notes": "",
    }


def recording(recording_id, source="child", age_band="9-11", audio_quality="ok"):
    return {"recordingId": recording_id, "source": source, "ageBand": age_band, "audioQuality": audio_quality}


def output(decision="accepted", findings=(), quality="ok", seconds=None):
    """The same decision at every level, for the combined model."""
    decisions = {"combined": {level: (decision, list(findings)) for level in evaluation.LEVELS}}
    return {"quality": quality, "seconds": seconds or {"combined": 1.0}, "decisions": decisions}


def finding(word, code):
    return make_finding(word, code, 0.9, 0, 0)




def test_two_teachers_who_agree_give_the_gold_label():
    labels = [
        label("R1", 1, annotator="TCH_A"),
        label("R1", 1, annotator="TCH_B"),
        label("R1", 2, ["ERR_MEM_OMISSION"], annotator="TCH_A"),
        label("R1", 2, ["ERR_MEM_OMISSION"], annotator="TCH_B"),
    ]

    gold, unresolved = evaluation.gold_labels(labels)

    assert gold == {"R1": {1: [], 2: ["ERR_MEM_OMISSION"]}}
    assert unresolved == set()


def test_the_reviewer_decides_when_the_teachers_disagree():
    labels = [
        label("R1", 1, ["ERR_PRON_HARAKA"], annotator="TCH_A"),
        label("R1", 1, annotator="TCH_B"),
        label("R1", 1, annotator="REV_1", round_number=2),
    ]

    gold, _ = evaluation.gold_labels(labels)

    assert gold == {"R1": {1: []}}


def test_a_disagreement_without_a_reviewer_leaves_the_recording_out():
    labels = [
        label("R1", 1, ["ERR_PRON_HARAKA"], annotator="TCH_A"),
        label("R1", 1, annotator="TCH_B"),
        label("R1", 2, annotator="TCH_A"),
        label("R1", 2, annotator="TCH_B"),
        label("R2", 1, annotator="TCH_A"),
        label("R2", 1, annotator="TCH_B"),
    ]

    gold, unresolved = evaluation.gold_labels(labels)

    assert set(gold) == {"R2"}
    assert unresolved == {"R1"}


def test_an_unknown_error_code_in_a_label_is_refused():
    with pytest.raises(ValueError):
        evaluation.gold_labels([label("R1", 1, ["ERR_NOT_A_CODE"])])


def test_what_stops_the_child_follows_the_level():
    word_codes = {1: ["ERR_PRON_HARAKA"], 2: [], 3: ["ERR_TAJ_MADD_SHORT"]}

    assert evaluation.gold_stopping_words(word_codes, "beginner") == {}
    assert evaluation.gold_stopping_words(word_codes, "intermediate") == {1: ["pronunciation"]}


def test_a_code_not_yet_approved_never_stops_the_child():
    assert evaluation.gold_stopping_words({1: ["ERR_MEM_INSERTION"]}, "advanced") == {}




def cases_for_rates():
    """
    4 correct readings: the model says accepted, accepted, error, uncertain.
    3 readings with a skipped word 2: the model says error (word 2), error (word 5), accepted.
    """
    correct = {1: [], 2: []}
    skipped = {1: [], 2: ["ERR_MEM_OMISSION"]}
    rows = [
        (correct, output("accepted")),
        (correct, output("accepted")),
        (correct, output("error", [finding(1, "ERR_MEM_SUBSTITUTION")])),
        (correct, output("uncertain")),
        (skipped, output("error", [finding(2, "ERR_MEM_OMISSION")])),
        (skipped, output("error", [finding(5, "ERR_MEM_OMISSION")])),
        (skipped, output("accepted")),
    ]
    return [{"recording": recording(f"R{i}"), "gold": gold, "output": out} for i, (gold, out) in enumerate(rows)]


def test_false_reject_false_accept_word_location_and_uncertain_rates():
    metrics = evaluation.decision_metrics(cases_for_rates(), "combined", "beginner")

    assert metrics == {
        "analysed": 7,
        "goldNoStop": 4,
        "goldStop": 3,
        "falseRejectRate": 0.25,  # 1 error out of 4 correct readings (the uncertain one stays in)
        "falseAcceptRate": 0.3333,  # 1 accepted out of 3 real mistakes
        "wordLocationAccuracy": 0.5,  # of the 2 errors on real mistakes, 1 points to word 2
        "uncertainRate": 0.1429,  # 1 of 7
    }


def test_no_recordings_gives_no_rate_instead_of_dividing_by_zero():
    metrics = evaluation.decision_metrics([], "combined", "beginner")
    assert metrics["falseRejectRate"] is None
    assert metrics["uncertainRate"] is None


def test_word_location_uses_the_first_word_the_child_would_hear_replayed():
    gold = {1: [], 2: ["ERR_MEM_OMISSION"], 3: []}
    out = output("error", [finding(1, "ERR_TAJ_MADD_SHORT"), finding(2, "ERR_MEM_OMISSION")])
    case = {"recording": recording("R1"), "gold": gold, "output": out}

    assert evaluation.decision_metrics([case], "combined", "beginner")["wordLocationAccuracy"] == 1.0


def test_false_accepts_are_split_by_the_category_of_the_gold_error():
    cases = [
        {"recording": recording("R1"), "gold": {1: ["ERR_MEM_OMISSION"]}, "output": output("accepted")},
        {"recording": recording("R2"), "gold": {1: ["ERR_PRON_HARAKA"]}, "output": output("error")},
    ]

    by_category = evaluation.false_accepts_by_category(cases, "combined", "intermediate")

    assert by_category == {
        "memorization": {"goldStop": 1, "falseAcceptRate": 1.0},
        "pronunciation": {"goldStop": 1, "falseAcceptRate": 0.0},
    }




def test_gate_precision_and_recall_leave_guard_rejections_apart():
    cases = [
        {"recording": recording("R1", audio_quality="poor_audio"), "output": output(quality="too_noisy")},
        {"recording": recording("R2", audio_quality="poor_audio"), "output": output(quality="ok")},
        {"recording": recording("R3"), "output": output(quality="silent")},
        {"recording": recording("R4"), "output": output(quality="ok")},
        {"recording": recording("R5"), "output": output(quality=evaluation.GUARD)},
    ]

    assert evaluation.gate_metrics(cases) == {
        "precision": 0.5,  # 2 rejections, 1 of them really poor audio
        "recall": 0.5,  # 2 poor recordings, 1 of them rejected
        "rejectedGood": 1,
        "missedPoor": 1,
        "guardRejections": 1,
    }


def test_percentiles_use_the_nearest_rank():
    values = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    assert evaluation.percentile(values, 0.50) == 0.5
    assert evaluation.percentile(values, 0.95) == 1.0
    assert evaluation.percentile([], 0.5) is None




def test_children_and_seeded_adults_are_reported_apart():
    recordings = [recording("C1"), recording("A1", source="seeded_adult", age_band=None)]
    gold = {"C1": {1: []}, "A1": {1: ["ERR_MEM_OMISSION"]}}
    outputs = {"C1": output("accepted"), "A1": output("accepted")}

    report = evaluation.summarize(recordings, gold, outputs, MODELS, ["combined"])

    child = report["child"]["decisions"]["combined"]["beginner"]["overall"]
    adult = report["seeded_adult"]["decisions"]["combined"]["beginner"]["overall"]
    assert (child["goldNoStop"], child["goldStop"]) == (1, 0)
    assert (adult["goldNoStop"], adult["goldStop"], adult["falseAcceptRate"]) == (0, 1, 1.0)
    assert list(report["seeded_adult"]["decisions"]["combined"]["beginner"]["byAgeBand"]) == ["n/a"]


def test_poor_audio_and_rejected_recordings_are_not_analysed():
    recordings = [recording("R1"), recording("R2", audio_quality="poor_audio"), recording("R3")]
    gold = {"R1": {1: []}, "R2": {1: []}, "R3": {1: []}}
    outputs = {"R1": output("accepted"), "R2": output("accepted"), "R3": output(quality="too_noisy")}

    report = evaluation.summarize(recordings, gold, outputs, MODELS, ["combined"])

    assert (report["child"]["recordings"], report["child"]["analysed"]) == (3, 1)


def test_a_changed_dataset_file_is_not_frozen(tmp_path):
    (tmp_path / "recordings.jsonl").write_text("{}\n", encoding="utf-8")
    (tmp_path / "labels.jsonl").write_text("{}\n", encoding="utf-8")
    splits = {"sha256": {name: evaluation.sha256_of(tmp_path / name) for name in ["recordings.jsonl", "labels.jsonl"]}}

    assert evaluation.check_frozen(tmp_path, splits)

    (tmp_path / "labels.jsonl").write_text(json.dumps({"changed": True}) + "\n", encoding="utf-8")
    assert not evaluation.check_frozen(tmp_path, splits)
