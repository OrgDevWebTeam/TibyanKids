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

    try:
        data = saved_outputs.load_split(folder, args.split, args.outputs)
    except saved_outputs.DatasetProblem as problem:
        sys.exit(str(problem))
    if not data["frozen"]:
        print("Note: the dataset is not frozen yet (fine for dev, never for test)")
    print(f"{len(data['recordings'])} labelled recordings in {args.split} ({len(data['unresolved'])} unresolved, left out)")
    print(f"Saved outputs: {data['runName']}")

    outputs = {rec: saved_outputs.case_output(saved) for rec, saved in data["saved"].items()}
    report = evaluation.summarize(
        data["recordings"], data["gold"], outputs, saved_outputs.MODELS, saved_outputs.TIMED_STEPS
    )
    run = {
        "date": datetime.now().isoformat(timespec="seconds"),
        "split": args.split,
        "outputs": data["runName"],
        "models": saved_outputs.read_run(folder / "outputs" / data["runName"])["models"],
        "policyVersion": POLICY_VERSION,
        "threshold": confidence_threshold(),
        "datasetSha256": data["splits"].get("sha256", {}),
        "datasetFrozen": data["frozen"],
        "unresolvedRecordings": len(data["unresolved"]),
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
