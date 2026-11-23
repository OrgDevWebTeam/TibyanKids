# Runs the gate and both models once on every recording of the dataset, and saves what they found
# (app/saved_outputs.py):
#   python scripts/run_models.py <tibyan-eval> [--name <run name>]
#
# The output goes to <tibyan-eval>/outputs/<run name>/, one file per recording, plus run.json with
# the model versions. scripts/evaluate.py and the threshold sweep read it and never load a model.
#
# Runs on every recording in audio/, test included: running a model is not tuning. What protects
# the test set is that only the final evaluate.py --split test run looks at test numbers (B.7).
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

GIB = 2**30


def surah_and_ayah(recording_id):
    """(surah, ayah) from REC_<speaker>_<surah>_<ayah>."""
    _, _, surah, ayah = recording_id.split("_")
    return int(surah), int(ayah)


def seconds_since(started):
    """Seconds since started (a time.perf_counter() value), rounded to milliseconds."""
    return round(time.perf_counter() - started, 3)


def empty_output(recording_id):
    """A saved output before any step has run."""
    surah, ayah = surah_and_ayah(recording_id)
    return {
        "recordingId": recording_id,
        "surah": surah,
        "ayah": ayah,
        "quality": None,
        "error": None,
        "gate": None,
        "seconds": {},
        "findings": {},
        "modelProblems": {},
    }


def run_gate(samples, saved):
    """Runs the quality gate and measures every gate number. Returns the clip the models get, or None."""
    started = time.perf_counter()
    # The VAD is the slow part, so it runs once and both functions are given its answer
    parts = speech_parts(samples)

    def speech_already_found(_samples):
        return parts

    saved["gate"] = measure_recording(samples, speech_already_found)
    quality, _, clip = check_quality(samples, speech_already_found)
    saved["seconds"]["gate"] = seconds_since(started)
    saved["quality"] = quality
    return clip


def run_model(name, find_errors, clip, reference, saved):
    """Runs one model and saves its findings as plain dicts. Saves None when it ran away or failed:
    the service answers uncertain then, and one bad recording must not stop a long run."""
    started = time.perf_counter()
    try:
        findings = find_errors(clip, reference)
    except whisper_quran.Runaway:
        saved["modelProblems"][name] = "runaway"
        findings = None
    except RuntimeError as error:
        saved["modelProblems"][name] = type(error).__name__
        findings = None
    saved["seconds"][name] = seconds_since(started)
    if findings is None:
        saved["findings"][name] = None
    else:
        saved["findings"][name] = [finding.model_dump() for finding in findings]


def analyse(path, recording_id, models=None):
    """The saved output of one recording. models replaces {name: find_errors} in tests."""
    if models is None:
        models = {muaalem.NAME: muaalem.find_errors, whisper_quran.NAME: whisper_quran.find_errors}
    saved = empty_output(recording_id)

    started = time.perf_counter()
    try:
        samples = decode_audio(path.read_bytes())
    except AudioError as error:
        saved["quality"] = saved_outputs.UNREADABLE
        saved["error"] = error.code
        return saved
    saved["seconds"]["decode"] = seconds_since(started)

    clip = run_gate(samples, saved)
    if clip is None:
        return saved  # like the service: a rejected recording never reaches the models

    ayah = get_ayah(saved["surah"], saved["ayah"])
    words = [word["text_imlaei"] for word in ayah["words"]]
    run_model(muaalem.NAME, models[muaalem.NAME], clip, ayah["text_uthmani"], saved)
    run_model(whisper_quran.NAME, models[whisper_quran.NAME], clip, words, saved)
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


def count(counts, key):
    """Adds one to counts[key]."""
    counts[key] = counts.get(key, 0) + 1


def print_summary(outputs):
    """Counts per gate result, model problems, and p50 / p95 seconds per step."""
    qualities, problems = {}, {}
    for saved in outputs:
        count(qualities, saved["quality"])
        for model, problem in saved["modelProblems"].items():
            count(problems, f"{model}: {problem}")
    print(f"Gate: {qualities}")
    print(f"Model problems: {problems or 'none'}")

    analysed = [saved for saved in outputs if saved["quality"] == "ok"]
    print(f"Seconds per ayah over {len(analysed)} analysed recordings:")
    for step in saved_outputs.TIMED_STEPS:
        values = [saved["seconds"][step] for saved in analysed if step in saved["seconds"]]
        print(f"  {step:<15} p50 {percentile(values, 0.5)}  p95 {percentile(values, 0.95)}")
    totals = [sum(saved["seconds"].values()) for saved in analysed]
    print(f"  {'total':<15} p50 {percentile(totals, 0.5)}  p95 {percentile(totals, 0.95)}")


def load_models():
    """Loads both models and returns their versions, {name: version}."""
    print("Loading the models...")
    muaalem.load_model()
    whisper_quran.load_model()
    return {muaalem.NAME: muaalem.model_version(), whisper_quran.NAME: whisper_quran.model_version()}


def run_recordings(todo, run_folder):
    """Analyses and saves each recording, with a progress line every 25."""
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()
    for number, path in enumerate(todo, 1):
        saved_outputs.write_output(run_folder, analyse(path, path.stem))
        if number % 25 == 0:
            print(f"  {number} / {len(todo)}")
    if torch.cuda.is_available() and todo:
        print(f"Peak GPU memory: {torch.cuda.max_memory_allocated() / GIB:.2f} GB")


def main():
    """Runs every recording not saved yet, then prints the summary of the whole run folder."""
    parser = argparse.ArgumentParser(description="Run the gate and both models once on the dataset")
    parser.add_argument("folder", type=Path, help="the tibyan-eval folder")
    today = date.today().isoformat()
    parser.add_argument("--name", default=today, help="the run folder name (default: today's date)")
    args = parser.parse_args()

    recordings = sorted((args.folder / "audio").glob("REC_*.wav"))
    if not recordings:
        sys.exit(f"No REC_*.wav files in {args.folder / 'audio'}")
    run_folder = args.folder / "outputs" / args.name
    start_run(run_folder, load_models())

    todo = [path for path in recordings if saved_outputs.read_output(run_folder, path.stem) is None]
    print(f"{len(recordings) - len(todo)} recordings already saved, {len(todo)} to run")
    run_recordings(todo, run_folder)

    print_summary([saved_outputs.read_output(run_folder, path.stem) for path in recordings])
    print(f"Saved in {run_folder}")


if __name__ == "__main__":
    main()
