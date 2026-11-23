# One evaluation run (dataset doc, Part B): python scripts/evaluate.py <tibyan-eval folder> --split dev|test [--outputs <run name>]
#
# Reads the models' saved outputs (scripts/run_models.py, outputs/<run name>/) and never loads a model,
# so a run takes seconds. The decisions are worked out again here, with today's decision policy and
# CONFIDENCE_THRESHOLD.
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import evaluation, saved_outputs  # noqa: E402
from app.policy import POLICY_VERSION, confidence_threshold  # noqa: E402


def newest_run(folder):
    """The name of the newest run folder in outputs/."""
    runs = sorted(path.name for path in (folder / "outputs").glob("*") if (path / saved_outputs.RUN_FILE).exists())
    if not runs:
        sys.exit(f"No saved outputs in {folder / 'outputs'}: run scripts/run_models.py first")
    return runs[-1]


def print_tables(report):
    """Prints the main numbers of each source, model and level."""
    for source, numbers in report.items():
        print()
        print(f"== {source}: {numbers['recordings']} recordings, {numbers['analysed']} analysed")
        print(f"   gate: {json.dumps(numbers['gate'])}")
        print(f"   latency (s): {json.dumps(numbers['latencySeconds'])}")
        print(f"   {'model':<15} {'level':<13} {'FR':>7} {'FA':>7} {'word':>7} {'unsure':>7}")
        for model, levels in numbers["decisions"].items():
            for level, metrics in levels.items():
                m = metrics["overall"]
                cells = [m["falseRejectRate"], m["falseAcceptRate"], m["wordLocationAccuracy"], m["uncertainRate"]]
                text = " ".join(f"{'-' if v is None else v:>7}" for v in cells)
                print(f"   {model:<15} {level:<13} {text}")


def main():
    """Evaluates one split from the saved outputs, writes runs/<date>-<time>-<split>.json (metrics only) and prints the tables."""
    parser = argparse.ArgumentParser(description="One evaluation run (docs/ai/audio-io-and-eval-dataset.md, B)")
    parser.add_argument("folder", type=Path, help="the tibyan-eval folder (B.4)")
    parser.add_argument("--split", required=True, choices=["dev", "test"])
    parser.add_argument("--outputs", help="the run folder in outputs/ (default: the newest)")
    args = parser.parse_args()
    folder = args.folder

    splits = json.loads((folder / "splits.json").read_text(encoding="utf-8"))
    frozen = evaluation.check_frozen(folder, splits)
    if args.split == "test" and not frozen:
        sys.exit("recordings.jsonl or labels.jsonl changed after the split was frozen: no test run (B.7)")
    if not frozen:
        print("Note: the dataset is not frozen yet (fine for dev, never for test)")

    speakers = set(splits[args.split])
    recordings = [r for r in evaluation.read_jsonl(folder / "recordings.jsonl") if r["speakerId"] in speakers]
    gold, unresolved = evaluation.gold_labels(evaluation.read_jsonl(folder / "labels.jsonl"))
    todo = [r for r in recordings if r["recordingId"] in gold]
    print(f"{len(todo)} labelled recordings in {args.split} ({len(unresolved)} unresolved, left out)")

    run_name = args.outputs or newest_run(folder)
    run_folder = folder / "outputs" / run_name
    outputs, missing = {}, []
    for recording in todo:
        saved = saved_outputs.read_output(run_folder, recording["recordingId"])
        if saved is None:
            missing.append(recording["recordingId"])
        else:
            outputs[recording["recordingId"]] = saved_outputs.case_output(saved)
    if missing:
        sys.exit(f"{len(missing)} recordings have no saved output in {run_name}: run scripts/run_models.py again")
    print(f"Saved outputs: {run_name}")

    report = evaluation.summarize(todo, gold, outputs, saved_outputs.MODELS, saved_outputs.TIMED_STEPS)
    run = {
        "date": datetime.now().isoformat(timespec="seconds"),
        "split": args.split,
        "outputs": run_name,
        "models": saved_outputs.read_run(run_folder)["models"],
        "policyVersion": POLICY_VERSION,
        "threshold": confidence_threshold(),
        "datasetSha256": splits.get("sha256", {}),
        "datasetFrozen": frozen,
        "unresolvedRecordings": len(unresolved),
        "results": report,
    }
    runs = folder / "runs"
    runs.mkdir(exist_ok=True)
    out = runs / f"{datetime.now():%Y-%m-%d-%H%M%S}-{args.split}.json"
    out.write_text(json.dumps(run, indent=2), encoding="utf-8")

    print_tables(report)
    print()
    print(f"Run saved: {out}")


if __name__ == "__main__":
    main()
