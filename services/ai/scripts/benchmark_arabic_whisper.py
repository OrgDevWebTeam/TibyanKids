# OD-03 (ADR-0010): which faster-whisper size for the Arabic words stage (FR-ARB-002) fits the GPU,
# and how fast and how accurate it is:
#   python scripts/benchmark_arabic_whisper.py [<reference recordings folder>] [--sizes ...]
#
# Test audio: every word of the 25 reference ayat, cut from the reference recitation at its word
# timings (adult reciter, Quran words). Real Arabic speech, so memory and speed are real numbers;
# accuracy is only a first sign, because children reading Arabic-track words sound different.
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
# large-v3 (the chosen size) loads from its pinned folder (scripts/download_models.py). The other
# sizes are only for comparing, and download to services/ai/models/faster-whisper-compare/<size>.
# By default the two recitation models are loaded first, as on the pilot machine, so the memory
# numbers show whether each size fits next to them (--alone measures the word model by itself).
# Prints a table and writes a JSON file of numbers after every size.
import argparse
import gc
import json
import sys
import time
from datetime import date
from pathlib import Path

import torch
from faster_whisper import WhisperModel
from faster_whisper.utils import download_model

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.adapters import arabic_words, muaalem, whisper_quran  # noqa: E402
from app.adapters.whisper_quran import normalize  # noqa: E402
from app.audio import SAMPLE_RATE, decode_audio  # noqa: E402
from app.evaluation import percentile  # noqa: E402
from app.model_files import models_dir  # noqa: E402
from app.reference import get_ayah, get_word_timings  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
SIZES = ["small", "medium", "large-v3-turbo", "large-v3"]
CHOSEN_SIZE = "large-v3"  # ADR-0010
MAX_PADDING_MS = 100
MAX_NEW_TOKENS = 10  # one Arabic word is a few tokens; more than this is a sentence that is not there
SHORT_CLIP_SECONDS = 1.0  # invented phrases happen mostly below this
RULES = ["exact", "contains", "close"]
GIB = 2**30


# ---------- Cutting the words ----------


def padding_into_gap(gap_ms):
    """Padding for one side of a word: at most MAX_PADDING_MS, and at most half the gap to the
    neighbour (None: no neighbour on that side), so no sound of the neighbour gets in."""
    if gap_ms is None:
        return MAX_PADDING_MS
    return max(0, min(MAX_PADDING_MS, gap_ms // 2))


def padded_bounds(timings, position, duration_ms):
    """(start_ms, end_ms) of one word with its padding, inside the recording."""
    start, end = timings[position]
    gap_before = None
    if position - 1 in timings:
        gap_before = start - timings[position - 1][1]
    gap_after = None
    if position + 1 in timings:
        gap_after = timings[position + 1][0] - end
    return max(0, start - padding_into_gap(gap_before)), min(duration_ms, end + padding_into_gap(gap_after))


def cut(samples, start_ms, end_ms):
    """The samples from start_ms to end_ms."""
    return samples[start_ms * SAMPLE_RATE // 1000 : end_ms * SAMPLE_RATE // 1000]


def neighbours_of(words, position):
    """The words just before and after this position (1 = first word)."""
    neighbours = []
    if position > 1:
        neighbours.append(words[position - 2])
    if position < len(words):
        neighbours.append(words[position])
    return neighbours


def clips_of_recording(path, surah, ayah):
    """One clip per word of one reference recording."""
    words = [word["text_imlaei"] for word in get_ayah(surah, ayah)["words"]]
    samples = decode_audio(path.read_bytes())
    duration_ms = len(samples) * 1000 // SAMPLE_RATE
    timings = get_word_timings(surah, ayah)
    clips = []
    for position in sorted(timings):
        start_ms, end_ms = padded_bounds(timings, position, duration_ms)
        clips.append({
            "ayah": f"{surah}:{ayah}",
            "position": position,
            "expected": words[position - 1],
            "neighbours": neighbours_of(words, position),
            "samples": cut(samples, start_ms, end_ms),
        })
    return clips


def word_clips(folder):
    """One clip per word of every reference recording (SSSAAA.mp3) in folder."""
    clips = []
    for path in sorted(Path(folder).glob("*.mp3")):
        surah, ayah = int(path.stem[:3]), int(path.stem[3:])
        if get_ayah(surah, ayah) is not None:
            clips += clips_of_recording(path, surah, ayah)
    return clips


# ---------- Comparing what was heard with the expected word ----------


def without_repeated_letters(word):
    """The word with each run of the same letter written once: a held sound comes out as ووووو.
    Both sides are cleaned the same way, so الله and اله still compare equal to each other."""
    cleaned = ""
    for letter in word:
        if not cleaned or cleaned[-1] != letter:
            cleaned += letter
    return cleaned


def words_of(text):
    """The words of a text, normalised: no marks, one form per letter, no punctuation, and no
    repeated letters."""
    words = []
    for word in text.split():
        cleaned = without_repeated_letters(normalize(word).strip(".,،؟!"))
        if cleaned:
            words.append(cleaned)
    return words


def as_one_word(text):
    """The normalised words of a text joined together, for comparing with one heard word."""
    return "".join(words_of(text))


def edit_distance(a, b):
    """Letters to add, remove or change to turn a into b (Levenshtein)."""
    previous = list(range(len(b) + 1))
    for i, letter_a in enumerate(a, 1):
        current = [i]
        for j, letter_b in enumerate(b, 1):
            changed = previous[j - 1] + (letter_a != letter_b)
            current.append(min(previous[j] + 1, current[j - 1] + 1, changed))
        previous = current
    return previous[-1]


def close(a, b):
    """At most one letter apart: a held madd written as an extra letter, or a dropped letter."""
    return edit_distance(a, b) <= 1


def matches(said, expected, rule):
    """True when the transcript counts as the expected word under this rule."""
    heard = words_of(said)
    target = as_one_word(expected)
    if rule == "exact":
        return "".join(heard) == target
    if rule == "contains":
        return target in heard
    return any(close(word, target) for word in heard)


def made_up_words(said, expected, neighbours):
    """"invented", "extra words" or None for one transcript (see the scores at the top)."""
    heard = words_of(said)
    target = as_one_word(expected)
    allowed = [target] + [as_one_word(word) for word in neighbours]
    unknown = [word for word in heard if not any(close(word, ok) for ok in allowed)]
    if not unknown:
        return None
    if any(close(word, target) for word in heard):
        return "extra words"
    return "invented"


def wrong_word_for(clips, index):
    """A different expected word to check this clip against: the first one from halfway down the
    list onwards (going round to the start), so it is usually from another surah."""
    target = as_one_word(clips[index]["expected"])
    # Halfway down the list from this clip; past the end, it counts on from the start of the list
    start = (index + len(clips) // 2) % len(clips)
    candidates = clips[start:] + clips[:start]
    for other in candidates:
        if as_one_word(other["expected"]) != target:
            return other["expected"]
    return None


# ---------- Scoring ----------


def judge(clip, said, wrong):
    """The verdict for one clip: correct and falseAccept per rule, made-up words, and short or not."""
    correct, false_accept = {}, {}
    for rule in RULES:
        correct[rule] = matches(said, clip["expected"], rule)
        false_accept[rule] = None if wrong is None else matches(said, wrong, rule)
    return {
        "short": len(clip["samples"]) / SAMPLE_RATE < SHORT_CLIP_SECONDS,
        "correct": correct,
        "falseAccept": false_accept,
        "madeUp": made_up_words(said, clip["expected"], clip["neighbours"]),
    }


def share(values):
    """The share of True among the values, leaving out None; None when nothing is left."""
    counted = [value for value in values if value is not None]
    if not counted:
        return None
    return round(sum(counted) / len(counted), 3)


def rates(verdicts):
    """The rates over a group of verdicts."""
    rules = {}
    for rule in RULES:
        rules[rule] = {
            "correct": share([verdict["correct"][rule] for verdict in verdicts]),
            "falseAccept": share([verdict["falseAccept"][rule] for verdict in verdicts]),
        }
    return {
        "clips": len(verdicts),
        "rules": rules,
        "inventedRate": share([verdict["madeUp"] == "invented" for verdict in verdicts]),
        "extraWordsRate": share([verdict["madeUp"] == "extra words" for verdict in verdicts]),
    }


def score(clips, transcripts):
    """The rates over all clips, and over the short clips apart (under "shortClips")."""
    verdicts = []
    for index, clip in enumerate(clips):
        verdicts.append(judge(clip, transcripts[index], wrong_word_for(clips, index)))
    result = rates(verdicts)
    result["shortClips"] = rates([verdict for verdict in verdicts if verdict["short"]])
    return result


# ---------- The model ----------


def gpu_used_gib():
    """GPU memory in use on the device, by every library and process (CTranslate2 included)."""
    free, total = torch.cuda.mem_get_info()
    return (total - free) / GIB


def model_folder(size):
    """large-v3 from its pinned folder; another size (for comparing only) downloaded once to
    services/ai/models/faster-whisper-compare/<size>, as plain files (no Hugging Face cache)."""
    if size == CHOSEN_SIZE:
        return arabic_words.model_folder()
    return download_model(size, output_dir=str(models_dir() / "faster-whisper-compare" / size))


def load_whisper(size):
    """A faster-whisper model of this size in float16 on the GPU. A new one each time (not the
    adapter's cached one), so the benchmark can free it and measure the next size."""
    # torch has started the GPU (main checks it), which loads the CUDA 12 libraries faster-whisper uses
    return WhisperModel(str(model_folder(size)), device="cuda", compute_type="float16")


def transcribe(model, samples):
    """The text the model hears in one clip: Arabic, greedy, short, no timestamps, no faster-whisper VAD."""
    segments, _ = model.transcribe(
        samples,
        language="ar",
        beam_size=1,
        temperature=0.0,
        max_new_tokens=MAX_NEW_TOKENS,
        without_timestamps=True,
        condition_on_previous_text=False,
        vad_filter=False,
    )
    return "".join(segment.text for segment in segments).strip()


# ---------- One size ----------


def measure_size(size, clips, load=load_whisper, hear=transcribe, used=gpu_used_gib):
    """The numbers of one size: memory, load time, seconds per word, the scores and the transcripts.
    load, hear and used are replaced in tests."""
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
    gc.collect()  # frees the GPU memory before the next size is loaded
    result = {
        "size": size,
        "loadSeconds": round(load_seconds, 1),
        "modelGiB": round(loaded - before, 2),
        "peakTotalGiB": round(peak, 2),
        "secondsPerWord": {"p50": percentile(seconds, 0.5), "p95": percentile(seconds, 0.95)},
        "words": len(clips),
    }
    result.update(score(clips, transcripts))
    # The reference reciter only, never a child: kept so the scores can be worked out again
    result["transcripts"] = []
    for clip, said in zip(clips, transcripts):
        result["transcripts"].append({"ayah": clip["ayah"], "position": clip["position"], "heard": said})
    return result


# ---------- Printing ----------


def print_speed(results):
    """Memory and speed of each size."""
    print(f"{'size':<16} {'model GiB':>9} {'peak total':>10} {'p50 s':>7} {'p95 s':>7}")
    for r in results:
        p50, p95 = r["secondsPerWord"]["p50"], r["secondsPerWord"]["p95"]
        print(f"{r['size']:<16} {r['modelGiB']:>9} {r['peakTotalGiB']:>10} {p50:>7} {p95:>7}")


def print_scores(title, groups):
    """One table of scores: [(size, rates)]."""
    print()
    print(f"-- {title}")
    columns = [f"{rule} ok" for rule in RULES] + [f"{rule} FA" for rule in RULES] + ["invented", "extra"]
    print(f"{'size':<16} {'clips':>5} " + " ".join(f"{column:>11}" for column in columns))
    for size, group in groups:
        values = [group["rules"][rule]["correct"] for rule in RULES]
        values += [group["rules"][rule]["falseAccept"] for rule in RULES]
        values += [group["inventedRate"], group["extraWordsRate"]]
        print(f"{size:<16} {group['clips']:>5} " + " ".join(f"{str(value):>11}" for value in values))


def print_tables(results):
    """Memory and speed, then the scores of all clips and of the short clips."""
    print_speed(results)
    print_scores("all clips", [(r["size"], r) for r in results])
    print_scores(f"clips under {SHORT_CLIP_SECONDS:g} s", [(r["size"], r["shortClips"]) for r in results])


# ---------- Command line ----------


def parse_arguments():
    """The reference recordings, the sizes, and where to save the numbers."""
    parser = argparse.ArgumentParser(description="OD-03: faster-whisper sizes for the Arabic words stage")
    default_folder = REPO / "datasets" / "reference-recitation"
    parser.add_argument("folder", type=Path, nargs="?", default=default_folder,
                        help="the 25 reference recordings, SSSAAA.mp3")
    parser.add_argument("--sizes", nargs="+", default=SIZES)
    parser.add_argument("--alone", action="store_true", help="do not load the two recitation models first")
    parser.add_argument("--out", type=Path, help="JSON file for the numbers (default: beside the recordings)")
    return parser.parse_args()


def load_recitation_models():
    """Loads the two recitation models, as they are on the pilot machine."""
    print("Loading the two recitation models first, as on the pilot machine...")
    muaalem.load_model()
    whisper_quran.load_model()


def new_report(total_gib, alone):
    """The numbers file before any size is measured: the settings of the run."""
    return {
        "date": date.today().isoformat(),
        "gpu": torch.cuda.get_device_name(),
        "gpuTotalGiB": round(total_gib, 2),
        "withRecitationModels": not alone,
        "computeType": "float16",
        "decoding": {"beamSize": 1, "temperature": 0.0, "maxNewTokens": MAX_NEW_TOKENS},
        "audio": f"reference recitation, one clip per word, padded up to {MAX_PADDING_MS} ms into the gaps",
        "results": [],
    }


def main():
    """Measures each size, saving the numbers after each one, then prints the tables."""
    args = parse_arguments()
    if not torch.cuda.is_available():
        sys.exit("No CUDA GPU: OD-03 is measured on the GPU machine")
    clips = word_clips(args.folder)
    if not clips:
        sys.exit(f"No reference recordings (SSSAAA.mp3) in {args.folder}")
    print(f"{len(clips)} words cut from {args.folder}")

    if not args.alone:
        load_recitation_models()
    total_gib = torch.cuda.mem_get_info()[1] / GIB
    print(f"GPU: {torch.cuda.get_device_name()} ({total_gib:.1f} GiB), {gpu_used_gib():.2f} GiB in use")

    report = new_report(total_gib, args.alone)
    out = args.out or args.folder.parent / f"od03-{date.today().isoformat()}.json"
    for size in args.sizes:
        print(f"Measuring {size}...", flush=True)
        report["results"].append(measure_size(size, clips))
        # Saved after every size, so a failure later never loses the sizes already measured
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print()
    print_tables(report["results"])
    print(f"Numbers saved: {out}")


if __name__ == "__main__":
    main()
