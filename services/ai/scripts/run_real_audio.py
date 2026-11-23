# Gate and models on a folder of SSSAAA.mp3 recordings: python scripts/run_real_audio.py <folder> <level>
import json
import sys
import time
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.adapters import muaalem, whisper_quran  # noqa: E402
from app.audio import AudioError, check_quality, decode_audio  # noqa: E402
from app.combine import combine_findings  # noqa: E402
from app.policy import decide  # noqa: E402
from app.reference import add_word_segments, get_ayah, get_word_timings  # noqa: E402

LEVELS = ["beginner", "intermediate", "advanced"]


def print_decision(label, findings, level):
    """Prints the decision for these findings at this level, and the findings."""
    decision, findings = decide(findings, level)
    print(f"  {label}: {decision}")
    for finding in findings:
        print("    " + json.dumps(finding.model_dump()))


def main():
    """Prints, per recording: the gate, each model alone, then both combined; then the GPU memory used."""
    if len(sys.argv) != 3 or sys.argv[2] not in LEVELS:
        print("Usage: python scripts/run_real_audio.py <folder> <beginner|intermediate|advanced>")
        sys.exit(1)
    folder = Path(sys.argv[1])
    level = sys.argv[2]

    files = sorted(folder.glob("*.mp3"))
    if not files:
        print(f"No mp3 files in {folder}")
        sys.exit(1)

    print("Loading the models...")
    started = time.perf_counter()
    muaalem.load_model()
    whisper_quran.load_model()
    print(f"Loaded in {time.perf_counter() - started:.1f} s")
    print(f"{muaalem.NAME}: {muaalem.model_version()}")
    print(f"{whisper_quran.NAME}: {whisper_quran.model_version()}")
    print()

    for file in files:
        name = file.stem
        print(name)
        if len(name) != 6 or not name.isdigit():
            print("  skipped: the name is not SSSAAA")
            continue
        surah, ayah_number = int(name[:3]), int(name[3:])
        ayah = get_ayah(surah, ayah_number)
        if ayah is None:
            print("  skipped: not one of the 25 prototype ayat")
            continue

        try:
            samples = decode_audio(file.read_bytes())
        except AudioError as error:
            print(f"  audio error: {error.code}")
            continue

        quality, report, clip = check_quality(samples)
        print(f"  gate: {quality} {json.dumps(report)}")
        if quality != "ok":
            continue

        started = time.perf_counter()
        muaalem_findings = muaalem.find_errors(clip, ayah["text_uthmani"])
        print_decision(f"{muaalem.NAME} ({time.perf_counter() - started:.2f} s)", muaalem_findings, level)

        started = time.perf_counter()
        words = [word["text_imlaei"] for word in ayah["words"]]
        try:
            whisper_findings = whisper_quran.find_errors(clip, words)
        except whisper_quran.Runaway:
            print(f"  {whisper_quran.NAME} ({time.perf_counter() - started:.2f} s): uncertain (runaway)")
            continue
        label = f"{whisper_quran.NAME} ({time.perf_counter() - started:.2f} s)"
        print_decision(label, whisper_findings, level)

        combined = combine_findings(muaalem_findings, whisper_findings)
        combined = add_word_segments(combined, get_word_timings(surah, ayah_number))
        print_decision("combined", combined, level)

    print()
    print(f"GPU memory used (peak): {torch.cuda.max_memory_allocated() / 1024**3:.2f} GB")


if __name__ == "__main__":
    main()
