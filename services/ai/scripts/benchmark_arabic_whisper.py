# OD-03: which faster-whisper size for the Arabic words stage (FR-ARB-002) fits the GPU, and how fast
# and how accurate it is: python scripts/benchmark_arabic_whisper.py [<reference recordings folder>]
#
# Test audio: every word of the 25 reference ayat, cut from the reference recitation at its word
# timings (adult reciter, Quran words). Real Arabic speech, so memory and speed are real numbers;
# accuracy is only a first sign, because children reading Arabic-track words will sound different.
# No child's recording is used.
#
# By default the two recitation models are loaded first, as on the pilot machine, so the memory
# numbers show whether each size fits next to them (--alone measures the word model by itself).
# Prints a table and writes a JSON file of numbers only.
import argparse
import gc
import json
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import cuda12  # noqa: E402
from app.adapters.whisper_quran import normalize  # noqa: E402
from app.audio import SAMPLE_RATE, decode_audio  # noqa: E402
from app.evaluation import percentile  # noqa: E402
from app.model_files import models_dir  # noqa: E402
from app.reference import get_ayah, get_word_timings  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
SIZES = ["small", "medium", "large-v3-turbo", "large-v3"]
PADDING_MS = 100  # a little audio around each word, as a child's recording of one word would have
GIB = 2**30


def word_clips(folder):
    """[(ayah id, word position, expected word, samples)] for every word of every reference recording."""
    clips = []
    for path in sorted(Path(folder).glob("*.mp3")):
        surah, ayah = int(path.stem[:3]), int(path.stem[3:])
        reference = get_ayah(surah, ayah)
        if reference is None:
            continue
        samples = decode_audio(path.read_bytes())
        for position, (start_ms, end_ms) in sorted(get_word_timings(surah, ayah).items()):
            clips.append((f"{surah}:{ayah}", position, reference["words"][position - 1]["text_imlaei"],
                          cut(samples, start_ms, end_ms)))
    return clips


def cut(samples, start_ms, end_ms, padding_ms=PADDING_MS):
    """The samples from start_ms to end_ms, with padding_ms more on both sides (within the recording)."""
    start = max(0, (start_ms - padding_ms) * SAMPLE_RATE // 1000)
    end = min(len(samples), (end_ms + padding_ms) * SAMPLE_RATE // 1000)
    return samples[start:end]


def same_word(said, expected):
    """True when the transcript is the expected word, ignoring marks, letter forms and spaces."""
    clean = lambda text: normalize(text).replace(" ", "").strip(".,،؟!")  # noqa: E731
    return clean(said) == clean(expected)


def gpu_used_gib():
    """GPU memory in use on the device, by every library and process (CTranslate2 included)."""
    import torch

    free, total = torch.cuda.mem_get_info()
    return (total - free) / GIB


def load_whisper(size):
    """A faster-whisper model in float16 on the GPU, downloaded once to services/ai/models/faster-whisper/<size>.
    Plain files, not the Hugging Face cache: the cache needs symbolic links, which Windows refuses
    without Developer Mode."""
    from faster_whisper import WhisperModel
    from faster_whisper.utils import download_model

    if not cuda12.make_findable():
        sys.exit("The CUDA 12 libraries are missing: pip install -r requirements-gpu.txt")
    folder = download_model(size, output_dir=str(models_dir() / "faster-whisper" / size))
    return WhisperModel(folder, device="cuda", compute_type="float16")


def transcribe(model, samples):
    """The text the model hears in one clip (Arabic, no timestamps, no faster-whisper VAD)."""
    segments, _ = model.transcribe(
        samples, language="ar", beam_size=5, without_timestamps=True,
        condition_on_previous_text=False, vad_filter=False,
    )
    return "".join(segment.text for segment in segments).strip()


def measure_size(size, clips, load=load_whisper, hear=transcribe, used=gpu_used_gib):
    """The numbers of one size: memory, load time, seconds per word, exact-match accuracy."""
    before = used()
    started = time.perf_counter()
    model = load(size)
    load_seconds = time.perf_counter() - started
    loaded = used()

    hear(model, clips[0][3])  # warm-up, not timed
    seconds, correct, peak = [], 0, loaded
    for _, _, expected, samples in clips:
        started = time.perf_counter()
        said = hear(model, samples)
        seconds.append(time.perf_counter() - started)
        correct += same_word(said, expected)
        peak = max(peak, used())

    del model
    gc.collect()
    return {
        "size": size,
        "loadSeconds": round(load_seconds, 1),
        "modelGiB": round(loaded - before, 2),
        "peakTotalGiB": round(peak, 2),
        "secondsPerWord": {"p50": percentile(seconds, 0.5), "p95": percentile(seconds, 0.95)},
        "words": len(clips),
        "exactMatch": round(correct / len(clips), 3) if clips else None,
    }


def main():
    """Measures each size and prints the table; writes the numbers to --out."""
    parser = argparse.ArgumentParser(description="OD-03: faster-whisper sizes for the Arabic words stage")
    parser.add_argument("folder", type=Path, nargs="?", default=REPO / "datasets" / "reference-recitation",
                        help="the 25 reference recordings, SSSAAA.mp3 (default datasets/reference-recitation)")
    parser.add_argument("--sizes", nargs="+", default=SIZES)
    parser.add_argument("--alone", action="store_true", help="do not load the two recitation models first")
    parser.add_argument("--out", type=Path, help="JSON file for the numbers (default: next to the recordings)")
    args = parser.parse_args()

    import torch

    if not torch.cuda.is_available():
        sys.exit("No CUDA GPU: OD-03 is measured on the GPU machine")

    clips = word_clips(args.folder)
    if not clips:
        sys.exit(f"No reference recordings (SSSAAA.mp3) in {args.folder}")
    print(f"{len(clips)} words cut from {args.folder}")

    if not args.alone:
        from app.adapters import muaalem, whisper_quran

        print("Loading the two recitation models first, as on the pilot machine...")
        muaalem.load_model()
        whisper_quran.load_model()
    total_gib = torch.cuda.mem_get_info()[1] / GIB
    print(f"GPU: {torch.cuda.get_device_name()} ({total_gib:.1f} GiB), {gpu_used_gib():.2f} GiB in use before the word model")

    report = {
        "date": date.today().isoformat(),
        "gpu": torch.cuda.get_device_name(),
        "gpuTotalGiB": round(total_gib, 2),
        "withRecitationModels": not args.alone,
        "computeType": "float16",
        "audio": "reference recitation, one clip per word",
        "results": [],
    }
    out = args.out or args.folder.parent / f"od03-{date.today().isoformat()}.json"
    results = report["results"]
    for size in args.sizes:
        print(f"Measuring {size}...", flush=True)
        results.append(measure_size(size, clips))
        # Saved after every size, so a failure later never loses the sizes already measured
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        r = results[-1]
        print(f"  {r['modelGiB']} GiB, p50 {r['secondsPerWord']['p50']} s per word, exact {r['exactMatch']}", flush=True)

    print()
    print(f"{'size':<16} {'model GiB':>9} {'peak total':>10} {'p50 s':>7} {'p95 s':>7} {'exact':>7} {'load s':>7}")
    for r in results:
        print(f"{r['size']:<16} {r['modelGiB']:>9} {r['peakTotalGiB']:>10} {r['secondsPerWord']['p50']:>7} "
              f"{r['secondsPerWord']['p95']:>7} {r['exactMatch']:>7} {r['loadSeconds']:>7}")

    print(f"Numbers saved: {out}")


if __name__ == "__main__":
    main()
