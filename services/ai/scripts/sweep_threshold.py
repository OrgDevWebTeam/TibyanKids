# The confidence threshold sweep on the dev split (dataset doc B.7 and B.8; OD-02):
#   python scripts/sweep_threshold.py <tibyan-eval> [--outputs <run name>]
#
# For every threshold from 0.50 to 0.95 (step 0.05) it works out the decisions again from the saved
# outputs (scripts/run_models.py) and gives, per model and level: false reject, false accept, false
# accept on memorization errors, word location and uncertain rates. No model is loaded.
#
# Dev only, never test: the threshold is tuned on dev and confirmed once on test (B.7).
# A row "meets" when it is within all three targets. The defaults are the B.8 starting targets,
# not approved yet; replace them with Mohammad's numbers with --max-false-reject and the others.
# Writes runs/<date>-<time>-sweep-dev.csv (numbers only) and prints the table.
import argparse
import csv
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import evaluation, saved_outputs  # noqa: E402

COLUMNS = [
    "model", "level", "threshold", "analysed", "falseRejectRate", "falseAcceptRate",
    "falseAcceptMemorization", "wordLocationAccuracy", "uncertainRate", "meetsTargets",
]


def thresholds(start, stop, step):
    """start, start + step, ... up to stop, rounded to 2 places.
    Counted in whole steps, because adding 0.05 again and again drifts (0.1 + 0.2 is not 0.3)."""
    steps = round((stop - start) / step)
    return [round(start + number * step, 2) for number in range(steps + 1)]


def meets(row, targets):
    """"yes" or "no" for the three targets; "unknown" when a rate has nothing to count yet."""
    checks = [
        (row["falseRejectRate"], targets["falseReject"]),
        (row["falseAcceptMemorization"], targets["falseAcceptMemorization"]),
        (row["uncertainRate"], targets["uncertain"]),
    ]
    if any(value is None for value, _ in checks):
        return "unknown"
    return "yes" if all(value <= limit for value, limit in checks) else "no"


def sweep(data, values, targets):
    """One row per model, level and threshold, for the child recordings of the split."""
    rows = []
    for threshold in values:
        outputs = {rec: saved_outputs.case_output(saved, threshold) for rec, saved in data.saved.items()}
        report = evaluation.summarize(data.recordings, data.gold, outputs, saved_outputs.MODELS, [])
        if "child" not in report:
            continue
        for model, levels in report["child"]["decisions"].items():
            for level, metrics in levels.items():
                overall = metrics["overall"]
                memorization = metrics["falseAcceptByCategory"].get("memorization", {})
                row = {
                    "model": model,
                    "level": level,
                    "threshold": threshold,
                    "analysed": overall["analysed"],
                    "falseRejectRate": overall["falseRejectRate"],
                    "falseAcceptRate": overall["falseAcceptRate"],
                    "falseAcceptMemorization": memorization.get("falseAcceptRate"),
                    "wordLocationAccuracy": overall["wordLocationAccuracy"],
                    "uncertainRate": overall["uncertainRate"],
                }
                row["meetsTargets"] = meets(row, targets)
                rows.append(row)
    return rows


def cell(value):
    """A rate as a column of 8 characters; "-" when there was nothing to count."""
    if value is None:
        return f"{'-':>8}"
    return f"{value:>8}"


def print_rows(rows):
    """One table per model and level, thresholds down the side."""
    for model in saved_outputs.MODELS:
        for level in evaluation.LEVELS:
            group = [row for row in rows if row["model"] == model and row["level"] == level]
            if not group:
                continue
            print()
            print(f"== {model}, {level} ({group[0]['analysed']} analysed recordings)")
            print(f"   {'thresh':>6} {'FR':>8} {'FA':>8} {'FA mem':>8} {'word':>8} {'unsure':>8}  meets")
            for row in group:
                numbers = [row["falseRejectRate"], row["falseAcceptRate"], row["falseAcceptMemorization"],
                           row["wordLocationAccuracy"], row["uncertainRate"]]
                print(f"   {row['threshold']:>6} {''.join(cell(v) for v in numbers)}  {row['meetsTargets']}")


def main():
    """Sweeps the thresholds on dev, writes the CSV and prints the tables."""
    parser = argparse.ArgumentParser(description="Confidence threshold sweep on the dev split (OD-02)")
    parser.add_argument("folder", type=Path, help="the tibyan-eval folder")
    parser.add_argument("--outputs", help="the run folder in outputs/ (default: the newest)")
    parser.add_argument("--from", dest="start", type=float, default=0.50)
    parser.add_argument("--to", dest="stop", type=float, default=0.95)
    parser.add_argument("--step", type=float, default=0.05)
    target = "B.8 starting target, not approved yet"
    parser.add_argument("--max-false-reject", type=float, default=0.05, help=target)
    parser.add_argument("--max-false-accept-memorization", type=float, default=0.15, help=target)
    parser.add_argument("--max-uncertain", type=float, default=0.30, help=target)
    args = parser.parse_args()

    try:
        data = saved_outputs.load_split(args.folder, "dev", args.outputs)
    except saved_outputs.DatasetProblem as problem:
        sys.exit(str(problem))
    if not data.recordings:
        sys.exit("No labelled dev recordings yet: import the teacher's labels first")
    print(f"{len(data.recordings)} labelled dev recordings, saved outputs: {data.run_name}")

    targets = {
        "falseReject": args.max_false_reject,
        "falseAcceptMemorization": args.max_false_accept_memorization,
        "uncertain": args.max_uncertain,
    }
    rows = sweep(data, thresholds(args.start, args.stop, args.step), targets)
    print_rows(rows)

    runs = args.folder / "runs"
    runs.mkdir(exist_ok=True)
    out = runs / f"{datetime.now():%Y-%m-%d-%H%M%S}-sweep-dev.csv"
    with open(out, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print()
    print(f"Targets: false reject <= {args.max_false_reject}, false accept (memorization) <= "
          f"{args.max_false_accept_memorization}, uncertain <= {args.max_uncertain} (B.8, not approved)")
    print(f"Sweep saved: {out}")


if __name__ == "__main__":
    main()
