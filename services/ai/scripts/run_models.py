# Runs the gate and both models once on every recording of the dataset, and saves what they found
# (app/saved_outputs.py): python scripts/run_models.py <tibyan-eval> [--name <run name>]
#
# The output goes to <tibyan-eval>/outputs/<run name>/, one file per recording, plus run.json with
# the model versions. scripts/evaluate.py and the threshold sweep read it and never load a model.
#
# Runs on every recording in audio/, test included: running a model is not tuning. What protects the
# test set is that only the final evaluate.py --split test run looks at test numbers (B.7).
# A second run with the same name continues where the first stopped (it skips saved recordings),
# and refuses if the model versions changed. It prints counts and timings only, never findings.
import argparse
import json
import sys
import time
from datetime import date
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import saved_outputs  # noqa: E402
from app.adapters import muaalem, whisper_quran  # noqa: E402
from app.audio import AudioError, check_quality, decode_audio, measure_recording, speech_parts  # noqa: E402
from app.evaluation import percentile  # noqa: E402
from app.reference import get_ayah  # noqa: E402


def surah_and_ayah(recording_id):
    """(surah, ayah) from REC_<speaker>_<surah>_<ayah>."""
    _, _, surah, ayah = recording_id.split("_")
    return int(surah), int(ayah)


def timed(seconds, step, work):
    """Runs work(), and stores how long it took in seconds[step]."""
    started = time.perf_counter()
    try:
        return work()
    finally:
        seconds[step] = round(time.perf_counter() - started, 3)


def run_model(name, work, seconds, saved):
    """The model's findings as plain dicts; None when it ran away or failed (the service says uncertain)."""
    try:
        findings = timed(seconds, name, work)
    except whisper_quran.Runaway:
        saved["modelProblems"][name] = "runaway"
        return None
    except Exception as error:  # noqa: BLE001 - one failed recording must not stop a long run
        saved["modelProblems"][name] = type(error).__name__
        return None
    return [finding.model_dump() for finding in findings]


def analyse(path, recording_id, models=None):
    """The saved output of one recording. models replaces {name: find_errors} in tests."""
    models = models or {muaalem.NAME: muaalem.find_errors, whisper_quran.NAME: whisper_quran.find_errors}
    surah, ayah = surah_and_ayah(recording_id)
    reference = get_ayah(surah, ayah)
    seconds = {}
    saved = {
        "recordingId": recording_id, "surah": surah, "ayah": ayah, "quality": None, "error": None,
        "gate": None, "seconds": seconds, "findings": {}, "modelProblems": {},
    }

    try:
        samples = timed(seconds, "decode", lambda: decode_audio(path.read_bytes()))
    except AudioError as error:
        saved["quality"], saved["error"] = saved_outputs.UNREADABLE, error.code
        return saved

    def gate():
        parts = speech_parts(samples)  # the VAD runs once for both
        return measure_recording(samples, lambda _: parts), check_quality(samples, lambda _: parts)

    saved["gate"], (quality, _, clip) = timed(seconds, "gate", gate)
    saved["quality"] = quality
    if quality != "ok":
        return saved  # like the service: a rejected recording never reaches the models

    words = [word["text_imlaei"] for word in reference["words"]]
    saved["findings"][muaalem.NAME] = run_model(
        muaalem.NAME, lambda: models[muaalem.NAME](clip, reference["text_uthmani"]), seconds, saved
    )
    saved["findings"][whisper_quran.NAME] = run_model(
        whisper_quran.NAME, lambda: models[whisper_quran.NAME](clip, words), seconds, saved
    )
    return saved


def start_run(run_folder, versions):
    """Creates the run folder, or checks that a folder being continued used the same model versions."""
    if (run_folder / saved_outputs.RUN_FILE).exists():
        earlier = saved_outputs.read_run(run_folder)["models"]
        if earlier != versions:
            sys.exit(f"{run_folder.name} was made with {earlier}, not {versions}: use another --name")
        return
    run_folder.mkdir(parents=True, exist_ok=True)
    run = {"date": date.today().isoformat(), "models": versions}
    (run_folder / saved_outputs.RUN_FILE).write_text(json.dumps(run, indent=2), encoding="utf-8")


def print_summary(outputs):
    """Counts per gate result, model problems, and p50 / p95 seconds per step (items 5 and 6)."""
    qualities, problems = {}, {}
    for saved in outputs:
        qualities[saved["quality"]] = qualities.get(saved["quality"], 0) + 1
        for model, problem in saved["modelProblems"].items():
            key = f"{model}: {problem}"
            problems[key] = problems.get(key, 0) + 1
    print(f"Gate: {qualities}")
    print(f"Model problems: {problems or 'none'}")
    analysed = [saved for saved in outputs if saved["quality"] == "ok"]
    print(f"Seconds per ayah over {len(analysed)} analysed recordings:")
    for step in saved_outputs.TIMED_STEPS:
        values = [saved["seconds"][step] for saved in analysed if step in saved["seconds"]]
        print(f"  {step:<15} p50 {percentile(values, 0.5)}  p95 {percentile(values, 0.95)}")
    totals = [sum(saved["seconds"].values()) for saved in analysed]
    print(f"  {'total':<15} p50 {percentile(totals, 0.5)}  p95 {percentile(totals, 0.95)}")


def main():
    """Runs every recording not saved yet, then prints the summary of the whole run folder."""
    parser = argparse.ArgumentParser(description="Run the gate and both models once on the dataset")
    parser.add_argument("folder", type=Path, help="the tibyan-eval folder")
    parser.add_argument("--name", default=date.today().isoformat(), help="the run folder name (default today)")
    args = parser.parse_args()

    recordings = sorted((args.folder / "audio").glob("REC_*.wav"))
    if not recordings:
        sys.exit(f"No REC_*.wav files in {args.folder / 'audio'}")

    print("Loading the models...")
    muaalem.load_model()
    whisper_quran.load_model()
    versions = {muaalem.NAME: muaalem.model_version(), whisper_quran.NAME: whisper_quran.model_version()}
    run_folder = args.folder / "outputs" / args.name
    start_run(run_folder, versions)

    todo = [path for path in recordings if saved_outputs.read_output(run_folder, path.stem) is None]
    print(f"{len(recordings) - len(todo)} recordings already saved, {len(todo)} to run")
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()
    for number, path in enumerate(todo, 1):
        saved_outputs.write_output(run_folder, analyse(path, path.stem))
        if number % 25 == 0:
            print(f"  {number} / {len(todo)}")

    print_summary([saved_outputs.read_output(run_folder, path.stem) for path in recordings])
    if torch.cuda.is_available() and todo:
        print(f"Peak GPU memory: {torch.cuda.max_memory_allocated() / 2**30:.2f} GB")
    print(f"Saved in {run_folder}")


if __name__ == "__main__":
    main()
