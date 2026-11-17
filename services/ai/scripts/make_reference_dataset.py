# Builds a small smoke-test dataset in the noor-eval layout (B.4) from the 25 reference recordings,
# so scripts/evaluate.py can be run end to end before the children's recordings exist. Owner: Qussai.
#
# Usage (from services/ai):
#   python scripts/make_reference_dataset.py <reference recordings folder> <output folder>
#   python scripts/make_reference_dataset.py ../../datasets/reference-recitation ../../../noor-eval-smoke
#
# For each prototype ayah it writes:
#   REF_SSSAAA      the reference recitation as it is: every word labelled "correct"
#   SKIP_SSSAAA     the same recording with its middle word cut out (ffmpeg): that word labelled
#                   ERR_MEM_OMISSION, every other word "correct"
# Every recording is source "seeded_adult" (an adult professional reciter, edited on purpose), so its
# numbers are always reported apart from children's (B.2). Not a measure of accuracy on children.
#
# The output folder must be outside the repository: it holds audio.
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.evaluation import sha256_of  # noqa: E402
from app.reference import get_ayah, get_word_timings  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
SPEAKER = "SPK_REF"  # one speaker: the reference reciter


def cut_word(source, target, start_ms, end_ms):
    """Writes source without the audio between start_ms and end_ms."""
    keep = (
        f"[0:a]atrim=0:{start_ms / 1000},asetpts=PTS-STARTPTS[a];"
        f"[0:a]atrim=start={end_ms / 1000},asetpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=0:a=1[out]"
    )
    command = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-filter_complex", keep, "-map", "[out]", str(target)]
    subprocess.run(command, check=True)


def recording(recording_id, surah, ayah):
    return {
        "recordingId": recording_id,
        "speakerId": SPEAKER,
        "consentId": "CON_REF",  # a published reference recitation (docs/ai/model-register.md), not a child
        "source": "seeded_adult",
        "ageBand": None,
        "surah": surah,
        "ayah": ayah,
        "device": "studio",
        "mimeType": "audio/mpeg",
        "recordedAt": date.today().isoformat(),
        "audioQuality": "ok",
        "split": "dev",
    }


def labels(recording_id, word_count, skipped_word=None):
    """Two teachers who agree (round 1) on every word."""
    lines = []
    for annotator in ["TCH_A", "TCH_B"]:
        for word in range(1, word_count + 1):
            wrong = word == skipped_word
            lines.append({
                "recordingId": recording_id,
                "wordIndex": word,
                "annotatorId": annotator,
                "round": 1,
                "teacherDecision": "needs_practice" if wrong else "correct",
                "errorCodes": ["ERR_MEM_OMISSION"] if wrong else [],
                "notes": "",
            })
    return lines


def write_jsonl(path, rows):
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


def main():
    if len(sys.argv) != 3:
        sys.exit("Usage: python scripts/make_reference_dataset.py <reference recordings folder> <output folder>")
    source_folder, out = Path(sys.argv[1]), Path(sys.argv[2]).resolve()
    if out.is_relative_to(REPO):
        sys.exit(f"{out} is inside the repository: the dataset holds audio, write it outside")

    (out / "audio").mkdir(parents=True, exist_ok=True)
    recordings, all_labels = [], []
    for file in sorted(source_folder.glob("*.mp3")):
        surah, ayah = int(file.stem[:3]), int(file.stem[3:])
        reference = get_ayah(surah, ayah)
        if reference is None:
            continue
        word_count = len(reference["words"])

        # The reading as it is
        ref_id = f"REF_{file.stem}"
        (out / "audio" / f"{ref_id}.mp3").write_bytes(file.read_bytes())
        recordings.append(recording(ref_id, surah, ayah))
        all_labels += labels(ref_id, word_count)

        # The same reading with its middle word skipped
        skipped = (word_count + 1) // 2
        start_ms, end_ms = get_word_timings(surah, ayah)[skipped]
        skip_id = f"SKIP_{file.stem}"
        cut_word(file, out / "audio" / f"{skip_id}.mp3", start_ms, end_ms)
        recordings.append(recording(skip_id, surah, ayah))
        all_labels += labels(skip_id, word_count, skipped_word=skipped)

    write_jsonl(out / "recordings.jsonl", recordings)
    write_jsonl(out / "labels.jsonl", all_labels)
    splits = {
        "train": [],
        "dev": [SPEAKER],
        "test": [],
        "sha256": {name: sha256_of(out / name) for name in ["recordings.jsonl", "labels.jsonl"]},
    }
    (out / "splits.json").write_text(json.dumps(splits, indent=2), encoding="utf-8")
    print(f"{len(recordings)} recordings written to {out}")


if __name__ == "__main__":
    main()
