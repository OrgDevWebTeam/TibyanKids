# OD-03 (ADR-0010): faster-whisper sizes for the Arabic words stage, on reference recitation words.
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

SIZES = ["small", "medium", "large-v3-turbo", "large-v3"]
CHOSEN_SIZE = "large-v3"
MAX_PADDING_MS = 100
MAX_NEW_TOKENS = 10
SHORT_CLIP_SECONDS = 1.0
RULES = ["exact", "contains", "close"]
GIB = 2**30


def padding_into_gap(gap_ms):
    """Padding for one side of a word: at most MAX_PADDING_MS and half the gap."""
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


def without_repeated_letters(word):
    """The word with each run of one letter written once."""
    cleaned = ""
    for letter in word:
        if not cleaned or cleaned[-1] != letter:
            cleaned += letter
    return cleaned


def words_of(text):
    """The normalised words of a text: no marks, punctuation or repeated letters."""
    words = []
    for word in text.split():
        cleaned = without_repeated_letters(normalize(word).strip(".,،؟!"))
        if cleaned:
            words.append(cleaned)
    return words


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


def matches(said, expected, rule):
    """True when the transcript counts as the expected word under this rule."""
    heard = words_of(said)
    target = "".join(words_of(expected))
    if rule == "exact":
        return "".join(heard) == target
    if rule == "contains":
        return target in heard
    return any(edit_distance(word, target) <= 1 for word in heard)


def close_to_any(word, allowed):
    """True when the word is close to one of the allowed words."""
    for ok in allowed:
        if edit_distance(word, ok) <= 1:
            return True
    return False


def made_up_words(said, expected, neighbours):
    """"invented", "extra words" or None for one transcript."""
    heard = words_of(said)
    target = "".join(words_of(expected))
    allowed = [target]
    for word in neighbours:
        allowed.append("".join(words_of(word)))

    unknown = []
    for word in heard:
        if not close_to_any(word, allowed):
            unknown.append(word)
    if not unknown:
        return None
    if close_to_any(target, heard):
        return "extra words"
    return "invented"


def wrong_word_for(clips, index):
    """A different word to check this clip against, from halfway down the list."""
    target = "".join(words_of(clips[index]["expected"]))
    start = index + len(clips) // 2
    if start >= len(clips):
        start -= len(clips)
    candidates = clips[start:] + clips[:start]
    for other in candidates:
        if "".join(words_of(other["expected"])) != target:
            return other["expected"]
    return None


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


def gpu_used_gib():
    """GPU memory in use on the device, by every library and process (CTranslate2 included)."""
    free, total = torch.cuda.mem_get_info()
    return (total - free) / GIB


def model_folder(size):
    """large-v3 from its pinned folder; other sizes from models/faster-whisper-compare/."""
    if size == CHOSEN_SIZE:
        return arabic_words.model_folder()
    return download_model(size, output_dir=str(models_dir() / "faster-whisper-compare" / size))


def load_whisper(size):
    """A new faster-whisper model of this size in float16 on the GPU."""
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


def measure_size(size, clips, load=load_whisper, hear=transcribe, used=gpu_used_gib):
    """Memory, load time, seconds per word, scores and transcripts of one size."""
    before = used()
    started = time.perf_counter()
    model = load(size)
    load_seconds = time.perf_counter() - started
    loaded = used()

    hear(model, clips[0]["samples"])
    seconds, transcripts, peak = [], [], loaded
    for clip in clips:
        started = time.perf_counter()
        transcripts.append(hear(model, clip["samples"]))
        seconds.append(time.perf_counter() - started)
        peak = max(peak, used())

    del model
    gc.collect()
    result = {
        "size": size,
        "loadSeconds": round(load_seconds, 1),
        "modelGiB": round(loaded - before, 2),
        "peakTotalGiB": round(peak, 2),
        "secondsPerWord": {"p50": percentile(seconds, 0.5), "p95": percentile(seconds, 0.95)},
        "words": len(clips),
    }
    result.update(score(clips, transcripts))
    result["transcripts"] = []
    for clip, said in zip(clips, transcripts):
        result["transcripts"].append({"ayah": clip["ayah"], "position": clip["position"], "heard": said})
    return result


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


def default_recordings_folder():
    """datasets/reference-recitation, or None outside the repository."""
    parents = Path(__file__).resolve().parents
    if len(parents) < 4:
        return None
    return parents[3] / "datasets" / "reference-recitation"


def parse_arguments():
    """The reference recordings, the sizes, and where to save the numbers."""
    parser = argparse.ArgumentParser(description="OD-03: faster-whisper sizes for the Arabic words stage")
    folder_help = "the 25 reference recordings, SSSAAA.mp3 (default: datasets/reference-recitation)"
    parser.add_argument("folder", type=Path, nargs="?", default=default_recordings_folder(), help=folder_help)
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
    if args.folder is None:
        sys.exit("Not inside the repository: give the folder of the reference recordings")
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
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print()
    print_tables(report["results"])
    print(f"Numbers saved: {out}")


if __name__ == "__main__":
    main()
