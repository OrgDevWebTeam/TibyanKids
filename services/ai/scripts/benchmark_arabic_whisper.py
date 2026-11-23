# OD-03: which faster-whisper size for the Arabic words stage (FR-ARB-002) fits the GPU, and how fast
# and how accurate it is: python scripts/benchmark_arabic_whisper.py [<reference recordings folder>]
#
# Test audio: every word of the 25 reference ayat, cut from the reference recitation at its word
# timings (adult reciter, Quran words). Real Arabic speech, so memory and speed are real numbers;
# accuracy is only a first sign, because children reading Arabic-track words will sound different.
# No child's recording is used.
#
# Each word is padded by up to 100 ms, but never past half the gap to its neighbours, so no sound of
# the next or previous word gets in. Decoding is greedy and short (temperature 0, at most 10 new
# tokens), so a one-word clip cannot turn into a sentence.
#
# Scores, each with three ways to say "the child read the word" (exact, contains, close):
#   correct      the clip of a word, checked against that word
#   falseAccept  the same clip, checked against a different word: "correct" here means a child who
#                read something else would be told they were right
#   invented     something was heard, but nothing close to the expected word or its neighbours
#   extra words  the word is there, plus made-up words that are neither it nor its neighbours
# Every score is also given for the clips shorter than 1 second, where invented phrases happen most.
#
# By default the two recitation models are loaded first, as on the pilot machine, so the memory
# numbers show whether each size fits next to them (--alone measures the word model by itself).
# Prints a table and writes a JSON file of numbers only, after every size.
import argparse
import gc
import json
import re
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
MAX_PADDING_MS = 100
MAX_NEW_TOKENS = 10  # one Arabic word is a few tokens; more than this is a sentence that is not there
RULES = ["exact", "contains", "close"]
GIB = 2**30


# ---------- Cutting the words ----------


def padded_bounds(timings, position, duration_ms):
    """(start_ms, end_ms) of one word, padded into the gaps around it: at most MAX_PADDING_MS, and
    never past half the gap to the previous or next word (nor outside the recording)."""
    start, end = timings[position]
    before = timings.get(position - 1)
    after = timings.get(position + 1)
    pad_before = MAX_PADDING_MS if before is None else max(0, min(MAX_PADDING_MS, (start - before[1]) // 2))
    pad_after = MAX_PADDING_MS if after is None else max(0, min(MAX_PADDING_MS, (after[0] - end) // 2))
    return max(0, start - pad_before), min(duration_ms, end + pad_after)


def cut(samples, start_ms, end_ms):
    """The samples from start_ms to end_ms."""
    return samples[start_ms * SAMPLE_RATE // 1000 : end_ms * SAMPLE_RATE // 1000]


def word_clips(folder):
    """One clip per word of every reference recording: {ayah, position, expected, neighbours, samples}."""
    clips = []
    for path in sorted(Path(folder).glob("*.mp3")):
        surah, ayah = int(path.stem[:3]), int(path.stem[3:])
        reference = get_ayah(surah, ayah)
        if reference is None:
            continue
        samples = decode_audio(path.read_bytes())
        duration_ms = len(samples) * 1000 // SAMPLE_RATE
        timings = get_word_timings(surah, ayah)
        words = [word["text_imlaei"] for word in reference["words"]]
        for position in sorted(timings):
            neighbours = [words[i - 1] for i in (position - 1, position + 1) if 1 <= i <= len(words)]
            clips.append({
                "ayah": f"{surah}:{ayah}",
                "position": position,
                "expected": words[position - 1],
                "neighbours": neighbours,
                "samples": cut(samples, *padded_bounds(timings, position, duration_ms)),
            })
    return clips


# ---------- Comparing what was heard with the expected word ----------


def words_of(text):
    """The words of a text, normalised: no marks, one form per letter, no punctuation, and a repeated
    letter written once (a held sound comes out as ووووو). Both sides are normalised the same way,
    so الله and اله still compare equal to each other."""
    words = (re.sub(r"(.)\1+", r"\1", normalize(w).strip(".,،؟!")) for w in text.split())
    return [word for word in words if word]


def edit_distance(a, b):
    """Letters to add, remove or change to turn a into b (Levenshtein)."""
    previous = list(range(len(b) + 1))
    for i, letter_a in enumerate(a, 1):
        current = [i]
        for j, letter_b in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (letter_a != letter_b)))
        previous = current
    return previous[-1]


def close(a, b):
    """At most one letter apart: a held madd written as an extra letter, or a dropped letter."""
    return edit_distance(a, b) <= 1


def matches(said, expected, rule):
    """True when the transcript counts as the expected word under this rule."""
    heard, target = words_of(said), "".join(words_of(expected))
    if rule == "exact":
        return "".join(heard) == target
    if rule == "contains":
        return target in heard
    return any(close(word, target) for word in heard)


def made_up_words(said, expected, neighbours):
    """("invented" or "extra words" or None) for one transcript:
    invented     something was heard, but nothing close to the expected word or its neighbours
    extra words  the expected word is there, plus words that are neither it nor its neighbours"""
    heard = words_of(said)
    target = "".join(words_of(expected))
    allowed = [target] + ["".join(words_of(word)) for word in neighbours]
    unknown = [word for word in heard if not any(close(word, ok) for ok in allowed)]
    if not unknown:
        return None
    return "extra words" if any(close(word, target) for word in heard) else "invented"


def wrong_word_for(clips, index):
    """A different expected word to check this clip against: half the list away, not the same word."""
    target = "".join(words_of(clips[index]["expected"]))
    for step in range(len(clips) // 2, len(clips) + len(clips) // 2):
        other = clips[(index + step) % len(clips)]["expected"]
        if "".join(words_of(other)) != target:
            return other
    return None


# ---------- The model ----------


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
    """The text the model hears in one clip: Arabic, greedy, short, no timestamps, no faster-whisper VAD."""
    segments, _ = model.transcribe(
        samples, language="ar", beam_size=1, temperature=0.0, max_new_tokens=MAX_NEW_TOKENS,
        without_timestamps=True, condition_on_previous_text=False, vad_filter=False,
    )
    return "".join(segment.text for segment in segments).strip()


# ---------- One size ----------


SHORT_CLIP_SECONDS = 1.0  # invented phrases happen mostly below this


def judge(clips, transcripts):
    """One verdict per clip: correct and falseAccept per rule, made-up words, and whether it is short."""
    verdicts = []
    for index, (clip, said) in enumerate(zip(clips, transcripts)):
        wrong = wrong_word_for(clips, index)
        verdicts.append({
            "short": len(clip["samples"]) / SAMPLE_RATE < SHORT_CLIP_SECONDS,
            "correct": {rule: matches(said, clip["expected"], rule) for rule in RULES},
            "falseAccept": {rule: None if wrong is None else matches(said, wrong, rule) for rule in RULES},
            "madeUp": made_up_words(said, clip["expected"], clip["neighbours"]),
        })
    return verdicts


def rates(verdicts):
    """The rates over a group of verdicts."""
    def share(values):
        values = [value for value in values if value is not None]
        return round(sum(values) / len(values), 3) if values else None

    return {
        "clips": len(verdicts),
        "rules": {
            rule: {
                "correct": share(v["correct"][rule] for v in verdicts),
                "falseAccept": share(v["falseAccept"][rule] for v in verdicts),
            }
            for rule in RULES
        },
        "inventedRate": share(v["madeUp"] == "invented" for v in verdicts),
        "extraWordsRate": share(v["madeUp"] == "extra words" for v in verdicts),
    }


def score(clips, transcripts):
    """The rates over all clips, and over the short clips apart."""
    verdicts = judge(clips, transcripts)
    return {**rates(verdicts), "shortClips": rates([v for v in verdicts if v["short"]])}


def measure_size(size, clips, load=load_whisper, hear=transcribe, used=gpu_used_gib):
    """The numbers of one size: memory, load time, seconds per word, and the scores."""
    before = used()
    started = time.perf_counter()
    model = load(size)
    load_seconds = time.perf_counter() - started
    loaded = used()

    hear(model, clips[0]["samples"])  # warm-up, not timed
    seconds, transcripts, peak = [], [], loaded
    for clip in clips:
        started = time.perf_counter()
        transcripts.append(hear(model, clip["samples"]))
        seconds.append(time.perf_counter() - started)
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
        **score(clips, transcripts),
        # The reference reciter only, never a child: kept so the scores can be worked out again
        "transcripts": [
            {"ayah": clip["ayah"], "position": clip["position"], "heard": said} for clip, said in zip(clips, transcripts)
        ],
    }


def print_table(results):
    """Memory and speed, then the scores of all clips and of the short clips."""
    print(f"{'size':<16} {'model GiB':>9} {'peak total':>10} {'p50 s':>7} {'p95 s':>7}")
    for r in results:
        print(f"{r['size']:<16} {r['modelGiB']:>9} {r['peakTotalGiB']:>10} {r['secondsPerWord']['p50']:>7} "
              f"{r['secondsPerWord']['p95']:>7}")
    for title, key in [("all clips", None), (f"clips under {SHORT_CLIP_SECONDS:g} s", "shortClips")]:
        print()
        print(f"-- {title}")
        header = " ".join(f"{rule + ' ok':>11} {rule + ' FA':>11}" for rule in RULES)
        print(f"{'size':<16} {'clips':>5} {header} {'invented':>9} {'extra':>7}")
        for r in results:
            group = r[key] if key else r
            cells = " ".join(
                f"{str(group['rules'][rule]['correct']):>11} {str(group['rules'][rule]['falseAccept']):>11}" for rule in RULES
            )
            print(f"{r['size']:<16} {group['clips']:>5} {cells} {str(group['inventedRate']):>9} {str(group['extraWordsRate']):>7}")


def main():
    """Measures each size, saving after each one, and prints the tables."""
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
        "decoding": {"beamSize": 1, "temperature": 0.0, "maxNewTokens": MAX_NEW_TOKENS},
        "audio": f"reference recitation, one clip per word, padded up to {MAX_PADDING_MS} ms into the gaps",
        "results": [],
    }
    out = args.out or args.folder.parent / f"od03-{date.today().isoformat()}.json"
    for size in args.sizes:
        print(f"Measuring {size}...", flush=True)
        report["results"].append(measure_size(size, clips))
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print()
    print_table(report["results"])
    print(f"Numbers saved: {out}")


if __name__ == "__main__":
    main()
