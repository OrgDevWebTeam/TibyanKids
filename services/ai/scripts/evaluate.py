# One evaluation run (dataset doc, Part B): python scripts/evaluate.py <tibyan-eval folder> --split dev|test
import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import evaluation  # noqa: E402
from app.adapters import muaalem, whisper_quran  # noqa: E402
from app.audio import AudioError, check_quality, decode_audio  # noqa: E402
from app.combine import combine_findings  # noqa: E402
from app.policy import POLICY_VERSION, confidence_threshold, decide  # noqa: E402
from app.reference import add_word_segments, get_ayah, get_word_timings  # noqa: E402

MODELS = [muaalem.NAME, whisper_quran.NAME, "combined"]
TIMED = ["decode", "gate", muaalem.NAME, whisper_quran.NAME]


def audio_file(folder, recording_id):
    """audio/<recordingId>.<ext>, the original upload."""
    matches = sorted((folder / "audio").glob(f"{recording_id}.*"))
    if not matches:
        raise FileNotFoundError(f"No audio file for {recording_id} in {folder / 'audio'}")
    return matches[0]


def check_one(path, recording):
    """The gate, each model once, and the decisions of each model and combined at every level."""
    seconds = {}
    ayah = get_ayah(recording["surah"], recording["ayah"])

    started = time.perf_counter()
    try:
        samples = decode_audio(path.read_bytes())
    except AudioError:
        return {"quality": evaluation.GUARD, "seconds": seconds, "decisions": {}}
    seconds["decode"] = time.perf_counter() - started

    started = time.perf_counter()
    quality, _, clip = check_quality(samples)
    seconds["gate"] = time.perf_counter() - started
    if quality == "too_long":
        return {"quality": evaluation.GUARD, "seconds": seconds, "decisions": {}}
    if quality != "ok":
        return {"quality": quality, "seconds": seconds, "decisions": {}}

    started = time.perf_counter()
    muaalem_findings = muaalem.find_errors(clip, ayah["text_uthmani"])
    seconds[muaalem.NAME] = time.perf_counter() - started

    started = time.perf_counter()
    try:
        whisper_findings = whisper_quran.find_errors(clip, [word["text_imlaei"] for word in ayah["words"]])
    except whisper_quran.Runaway:
        whisper_findings = None  # uncertain, as in the service
    seconds[whisper_quran.NAME] = time.perf_counter() - started

    timings = get_word_timings(recording["surah"], recording["ayah"])
    findings = {muaalem.NAME: muaalem_findings, whisper_quran.NAME: whisper_findings}
    findings["combined"] = None if whisper_findings is None else combine_findings(muaalem_findings, whisper_findings)

    decisions = {}
    for model in MODELS:
        decisions[model] = {}
        for level in evaluation.LEVELS:
            if findings[model] is None:
                decisions[model][level] = ("uncertain", [])
            else:
                decisions[model][level] = decide(add_word_segments(findings[model], timings), level)
    return {"quality": "ok", "seconds": seconds, "decisions": decisions}


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
    """Runs the split, writes runs/<date>-<time>-<split>.json (metrics only) and prints the tables."""
    parser = argparse.ArgumentParser(description="One evaluation run (docs/ai/audio-io-and-eval-dataset.md, B)")
    parser.add_argument("folder", type=Path, help="the tibyan-eval folder (B.4)")
    parser.add_argument("--split", required=True, choices=["dev", "test"])
    args = parser.parse_args()
    folder = args.folder

    splits = json.loads((folder / "splits.json").read_text(encoding="utf-8"))
    frozen = evaluation.check_frozen(folder, splits)
    if args.split == "test" and not frozen:
        sys.exit("recordings.jsonl or labels.jsonl changed after the split was frozen: no test run (B.7)")
    if not frozen:
        print("Note: the dataset files differ from the hashes in splits.json (fine for dev, never for test)")

    speakers = set(splits[args.split])
    recordings = [r for r in evaluation.read_jsonl(folder / "recordings.jsonl") if r["speakerId"] in speakers]
    gold, unresolved = evaluation.gold_labels(evaluation.read_jsonl(folder / "labels.jsonl"))
    todo = [r for r in recordings if r["recordingId"] in gold]
    print(f"{len(todo)} labelled recordings in {args.split} ({len(unresolved)} unresolved, left out)")

    print("Loading the models...")
    muaalem.load_model()
    whisper_quran.load_model()

    outputs = {}
    for number, recording in enumerate(todo, 1):
        outputs[recording["recordingId"]] = check_one(audio_file(folder, recording["recordingId"]), recording)
        if number % 25 == 0:
            print(f"  {number} / {len(todo)}")

    report = evaluation.summarize(todo, gold, outputs, MODELS, TIMED)
    run = {
        "date": datetime.now().isoformat(timespec="seconds"),
        "split": args.split,
        "models": {muaalem.NAME: muaalem.model_version(), whisper_quran.NAME: whisper_quran.model_version()},
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
