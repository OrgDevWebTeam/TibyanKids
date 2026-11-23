# One evaluation run from the saved outputs: python scripts/evaluate.py <tibyan-eval> --split dev|test
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import evaluation, saved_outputs  # noqa: E402
from app.policy import POLICY_VERSION, confidence_threshold  # noqa: E402


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
                names = ["falseRejectRate", "falseAcceptRate", "wordLocationAccuracy", "uncertainRate"]
                rates = [m[name] for name in names]
                text = " ".join(f"{'-' if rate is None else rate:>7}" for rate in rates)
                print(f"   {model:<15} {level:<13} {text}")


def parse_arguments():
    """The dataset folder, the split and the saved outputs to use."""
    parser = argparse.ArgumentParser(description="One evaluation run (dataset doc, Part B)")
    parser.add_argument("folder", type=Path, help="the tibyan-eval folder (B.4)")
    parser.add_argument("--split", required=True, choices=["dev", "test"])
    parser.add_argument("--outputs", help="the run folder in outputs/ (default: the newest)")
    return parser.parse_args()


def run_file(data, split, report):
    """The contents of one runs/*.json file: metrics, versions and settings only (B.9)."""
    run = json.loads((data.run_folder / saved_outputs.RUN_FILE).read_text(encoding="utf-8"))
    return {
        "date": datetime.now().isoformat(timespec="seconds"),
        "split": split,
        "outputs": data.run_name,
        "models": run["models"],
        "policyVersion": POLICY_VERSION,
        "threshold": confidence_threshold(),
        "datasetSha256": data.splits.get("sha256", {}),
        "datasetFrozen": data.frozen,
        "unresolvedRecordings": len(data.unresolved),
        "results": report,
    }


def main():
    """Evaluates one split from the saved outputs, writes runs/<date>-<split>.json and prints the tables."""
    args = parse_arguments()
    try:
        data = saved_outputs.load_split(args.folder, args.split, args.outputs)
    except saved_outputs.DatasetProblem as problem:
        sys.exit(str(problem))
    if not data.frozen:
        print("Note: the dataset is not frozen yet (fine for dev, never for test)")
    unresolved = len(data.unresolved)
    print(f"{len(data.recordings)} labelled recordings in {args.split} ({unresolved} unresolved, left out)")
    print(f"Saved outputs: {data.run_name}")

    outputs = {}
    for rec_id, saved in data.saved.items():
        outputs[rec_id] = saved_outputs.case_output(saved)
    models, steps = saved_outputs.MODELS, saved_outputs.TIMED_STEPS
    report = evaluation.summarize(data.recordings, data.gold, outputs, models, steps)

    runs = args.folder / "runs"
    runs.mkdir(exist_ok=True)
    out = runs / f"{datetime.now():%Y-%m-%d-%H%M%S}-{args.split}.json"
    out.write_text(json.dumps(run_file(data, args.split, report), indent=2), encoding="utf-8")

    print_tables(report)
    print()
    print(f"Run saved: {out}")


if __name__ == "__main__":
    main()
