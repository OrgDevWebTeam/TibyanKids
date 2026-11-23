# Evaluation numbers: the models' decisions against the teachers' gold labels (dataset doc, Part B).
import hashlib
import json
import math
from pathlib import Path

from app.policy import CODES, make_finding, stops_child

LEVELS = ["beginner", "intermediate", "advanced"]
GUARD = "guard"


def read_jsonl(path):
    """The rows of a .jsonl file."""
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def sha256_of(path):
    """The SHA-256 of a file, as hex."""
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def check_frozen(folder, splits):
    """True when recordings.jsonl and labels.jsonl still match the hashes frozen in splits.json."""
    frozen = splits.get("sha256", {})
    names = ["recordings.jsonl", "labels.jsonl"]
    return all(sha256_of(Path(folder) / name) == frozen.get(name) for name in names)


def gold_labels(labels):
    """({recordingId: {wordIndex: [codes]}}, unresolved ids): agreeing round-1 labels, else round 2."""
    by_word = {}
    for label in labels:
        unknown = set(label["errorCodes"]) - set(CODES)
        if unknown:
            where = f"{label['recordingId']} word {label['wordIndex']}"
            raise ValueError(f"{where}: unknown codes {sorted(unknown)}")
        key = (label["recordingId"], label["wordIndex"])
        by_word.setdefault(key, []).append(label)

    gold = {}
    unresolved = set()
    for (recording_id, word_index), word_labels in by_word.items():
        final = [label for label in word_labels if label["round"] == 2]
        first = [label for label in word_labels if label["round"] == 1]
        decisions_agree = all(label["teacherDecision"] == first[0]["teacherDecision"] for label in first)
        codes_agree = all(sorted(label["errorCodes"]) == sorted(first[0]["errorCodes"]) for label in first)
        if final:
            chosen = final[-1]
        elif first and decisions_agree and codes_agree:
            chosen = first[0]
        else:
            unresolved.add(recording_id)
            continue
        gold.setdefault(recording_id, {})[word_index] = sorted(chosen["errorCodes"])

    for recording_id in unresolved:
        gold.pop(recording_id, None)
    return gold, unresolved


def gold_stopping_words(word_codes, level):
    """{wordIndex: [categories]} of the gold errors that stop the child at this level."""
    stopping = {}
    for word_index, codes in word_codes.items():
        for code in codes:
            finding = make_finding(word_index, code, 1.0, 0, 0)
            if stops_child(finding, level):
                stopping.setdefault(word_index, []).append(finding.category)
    return stopping


def rate(count, total):
    """count / total rounded to 4 places, or None when total is 0."""
    return round(count / total, 4) if total else None


def decision_metrics(cases, model, level):
    """False reject, false accept, word location and uncertain rates; uncertain answers stay in the totals."""
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
    return {category: {"goldStop": totals[category],
                       "falseAcceptRate": rate(accepted[category], totals[category])}
            for category in sorted(totals)}


def gate_metrics(cases):
    """Precision and recall of the gate's rejections against gold "poor_audio"; guard rejections apart."""
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
    """Nearest-rank percentile, or None for no values."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(len(ordered) * share))
    return round(ordered[rank - 1], 3)


def latency(cases, models):
    """p50 and p95 seconds per ayah for each timed step and in total."""
    report = {}
    for model in models:
        seconds = [case["output"]["seconds"][model] for case in cases if model in case["output"]["seconds"]]
        report[model] = {"p50": percentile(seconds, 0.50), "p95": percentile(seconds, 0.95)}
    totals = [sum(case["output"]["seconds"].values()) for case in cases]
    report["total"] = {"p50": percentile(totals, 0.50), "p95": percentile(totals, 0.95)}
    return report


def summarize(recordings, gold, outputs, models, timed_models):
    """All the numbers of one run, with child and seeded-adult recordings reported apart."""
    report = {}
    for source in ["child", "seeded_adult"]:
        labelled = [
            {"recording": r, "gold": gold[r["recordingId"]], "output": outputs[r["recordingId"]]}
            for r in recordings
            if r["source"] == source and r["recordingId"] in gold and r["recordingId"] in outputs
        ]
        if not labelled:
            continue
        analysed = []
        for case in labelled:
            if case["output"]["quality"] == "ok" and case["recording"]["audioQuality"] == "ok":
                analysed.append(case)
        age_bands = sorted({c["recording"].get("ageBand") or "n/a" for c in analysed})

        decisions = {}
        for model in models:
            decisions[model] = {}
            for level in LEVELS:
                decisions[model][level] = {
                    "overall": decision_metrics(analysed, model, level),
                    "byAgeBand": {
                        band: decision_metrics(
                            [c for c in analysed if (c["recording"].get("ageBand") or "n/a") == band],
                            model,
                            level,
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
