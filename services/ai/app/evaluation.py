# Evaluation: the models' decisions compared with the teachers' gold labels. Owner: Qussai.
# Rules: docs/ai/audio-io-and-eval-dataset.md, Part B (B.5 to B.9). Used by scripts/evaluate.py.
#
# Plain functions on plain data, no models: everything here is tested without audio or a GPU
# (tests/test_evaluation.py).
#
# Words used here:
#   gold          the teachers' label for each word (B.6)
#   stopping      an error that stops the child at that level (policy.stops_child, CRS 5.4)
#   analysed      a recording that passed the quality gate and has gold audio "ok"
#   output        what the models said about one recording (built by scripts/evaluate.py):
#                 {"quality": "ok" or a reject reason or "guard",
#                  "seconds": {"decode": 0.03, "gate": 0.05, "quran-muaalem": 0.4, ...},
#                  "decisions": {model: {level: (decision, findings)}}}
import hashlib
import json
import math
from pathlib import Path

from app.policy import CODES, make_finding, stops_child

LEVELS = ["beginner", "intermediate", "advanced"]
# "guard": stopped before the quality gate (unreadable audio) or by the length guard (too_long).
# Not a quality result, so not part of the gate's precision and recall (B.8).
GUARD = "guard"


# --- Reading the dataset (B.4 to B.7) ---------------------------------------------------------


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def sha256_of(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def check_frozen(folder, splits):
    """
    True when recordings.jsonl and labels.jsonl are exactly the files frozen in splits.json (B.7).
    The test set must never change after it is frozen.
    """
    frozen = splits.get("sha256", {})
    return all(sha256_of(Path(folder) / name) == frozen.get(name) for name in ["recordings.jsonl", "labels.jsonl"])


def gold_labels(labels):
    """
    Returns ({recordingId: {wordIndex: [error codes]}}, {recordingIds that are unresolved}).
    The gold label of a word: the two round-1 labels when they agree, otherwise the reviewer's
    round-2 label (B.6). A word whose round-1 labels disagree with no round-2 label is unresolved:
    its recording is left out of the numbers rather than guessed.
    Only error codes are kept: "correct" and "poor_audio" words have none.
    """
    by_word = {}
    for label in labels:
        unknown = set(label["errorCodes"]) - set(CODES)
        if unknown:
            raise ValueError(f"{label['recordingId']} word {label['wordIndex']}: unknown codes {sorted(unknown)}")
        key = (label["recordingId"], label["wordIndex"])
        by_word.setdefault(key, []).append(label)

    gold = {}
    unresolved = set()
    for (recording_id, word_index), word_labels in by_word.items():
        final = [label for label in word_labels if label["round"] == 2]
        first = [label for label in word_labels if label["round"] == 1]
        if final:
            chosen = final[-1]
        elif first and all(same_label(label, first[0]) for label in first):
            chosen = first[0]
        else:
            unresolved.add(recording_id)
            continue
        gold.setdefault(recording_id, {})[word_index] = sorted(chosen["errorCodes"])

    for recording_id in unresolved:
        gold.pop(recording_id, None)
    return gold, unresolved


def same_label(a, b):
    return a["teacherDecision"] == b["teacherDecision"] and sorted(a["errorCodes"]) == sorted(b["errorCodes"])


def gold_stopping_words(word_codes, level):
    """{wordIndex: [categories]} of the gold errors that stop the child at this level."""
    stopping = {}
    for word_index, codes in word_codes.items():
        for code in codes:
            finding = make_finding(word_index, code, 1.0, 0, 0)
            if stops_child(finding, level):
                stopping.setdefault(word_index, []).append(finding.category)
    return stopping


# --- The metrics (B.8) --------------------------------------------------------------------------


def rate(count, total):
    return round(count / total, 4) if total else None


def decision_metrics(cases, model, level):
    """
    False reject, false accept, word location and uncertain rate for one model at one level.
    cases: [{"recording", "gold", "output"}], analysed recordings only.
    The denominators keep "uncertain" answers in, so sending everything to the teacher cannot make
    the rates look good; the uncertain rate shows that cost.
    """
    no_stop = stop = false_rejects = false_accepts = both_error = located = uncertain = 0
    for case in cases:
        decision, findings = case["output"]["decisions"][model][level]
        gold_words = gold_stopping_words(case["gold"], level)
        uncertain += decision == "uncertain"

        if not gold_words:
            no_stop += 1
            false_rejects += decision == "error"
            continue

        stop += 1
        false_accepts += decision == "accepted"
        if decision == "error":
            both_error += 1
            # The first word the child would see highlighted and hear replayed (FR-QUR-005)
            model_words = sorted(f.wordIndex for f in findings if stops_child(f, level))
            located += bool(model_words) and model_words[0] in gold_words

    return {
        "analysed": len(cases),
        "goldNoStop": no_stop,
        "goldStop": stop,
        "falseRejectRate": rate(false_rejects, no_stop),
        "falseAcceptRate": rate(false_accepts, stop),
        "wordLocationAccuracy": rate(located, both_error),
        "uncertainRate": rate(uncertain, len(cases)),
    }


def false_accepts_by_category(cases, model, level):
    """The false accept rate for each category of gold stopping error (a recording can be in two)."""
    totals, accepted = {}, {}
    for case in cases:
        decision, _ = case["output"]["decisions"][model][level]
        categories = {c for cats in gold_stopping_words(case["gold"], level).values() for c in cats}
        for category in categories:
            totals[category] = totals.get(category, 0) + 1
            accepted[category] = accepted.get(category, 0) + (decision == "accepted")
    return {category: {"goldStop": totals[category], "falseAcceptRate": rate(accepted[category], totals[category])}
            for category in sorted(totals)}


def gate_metrics(cases):
    """
    Precision and recall of the quality gate's rejections against gold "poor_audio" (B.8).
    cases: every recording with a gold label, analysed or not. Guard rejections are counted apart.
    """
    true_rejects = false_rejects = missed = guard = 0
    for case in cases:
        quality = case["output"]["quality"]
        if quality == GUARD:
            guard += 1
            continue
        rejected = quality != "ok"
        poor = case["recording"]["audioQuality"] == "poor_audio"
        true_rejects += rejected and poor
        false_rejects += rejected and not poor
        missed += poor and not rejected
    return {
        "precision": rate(true_rejects, true_rejects + false_rejects),
        "recall": rate(true_rejects, true_rejects + missed),
        "rejectedGood": false_rejects,
        "missedPoor": missed,
        "guardRejections": guard,
    }


def percentile(values, share):
    """Nearest-rank percentile: the smallest value that at least `share` of the values are <= to."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(len(ordered) * share))
    return round(ordered[rank - 1], 3)


def latency(cases, models):
    """p50 and p95 seconds per ayah for each model, and for the whole check (decode to decision)."""
    report = {}
    for model in models:
        seconds = [case["output"]["seconds"][model] for case in cases if model in case["output"]["seconds"]]
        report[model] = {"p50": percentile(seconds, 0.50), "p95": percentile(seconds, 0.95)}
    totals = [sum(case["output"]["seconds"].values()) for case in cases]
    report["total"] = {"p50": percentile(totals, 0.50), "p95": percentile(totals, 0.95)}
    return report


# --- One run (B.9) ------------------------------------------------------------------------------


def summarize(recordings, gold, outputs, models, timed_models):
    """
    All the numbers of one run. Child and seeded-adult recordings are reported apart and never
    mixed (B.2). recordings: the recordings of the split; gold: from gold_labels(); outputs:
    {recordingId: output}; models: the decision sources ("quran-muaalem", "whisper-quran",
    "combined"); timed_models: the steps with a time in output["seconds"].
    """
    report = {}
    for source in ["child", "seeded_adult"]:
        labelled = [
            {"recording": r, "gold": gold[r["recordingId"]], "output": outputs[r["recordingId"]]}
            for r in recordings
            if r["source"] == source and r["recordingId"] in gold and r["recordingId"] in outputs
        ]
        if not labelled:
            continue
        analysed = [c for c in labelled if c["output"]["quality"] == "ok" and c["recording"]["audioQuality"] == "ok"]
        age_bands = sorted({c["recording"].get("ageBand") or "n/a" for c in analysed})

        decisions = {}
        for model in models:
            decisions[model] = {}
            for level in LEVELS:
                decisions[model][level] = {
                    "overall": decision_metrics(analysed, model, level),
                    "byAgeBand": {
                        band: decision_metrics(
                            [c for c in analysed if (c["recording"].get("ageBand") or "n/a") == band], model, level
                        )
                        for band in age_bands
                    },
                    "falseAcceptByCategory": false_accepts_by_category(analysed, model, level),
                }
        report[source] = {
            "recordings": len(labelled),
            "analysed": len(analysed),
            "gate": gate_metrics(labelled),
            "latencySeconds": latency(analysed, timed_models),
            "decisions": decisions,
        }
    return report
