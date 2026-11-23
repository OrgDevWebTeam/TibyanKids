# Turns the children's recordings into the evaluation layout (docs/ai/audio-io-and-eval-dataset.md, B.4 to B.7).
#
# The dataset holds children's voices, so the output folder is datasets/tibyan-eval (ignored by git
# and Docker) or a folder outside the repository. Anywhere else in the repository is refused.
# Four steps, in this order:
#
#   1. layout         python scripts/prepare_dataset.py layout <source> <tibyan-eval>
#      Copies <source>/SPK_xxx/<surah>_<ayah>.wav to audio/, and writes two sheets to fill in:
#      speakers.csv (age band, consent) and labelling_sheet.csv (one row per word, for the teacher).
#
#   2. split          python scripts/prepare_dataset.py split <tibyan-eval> --test 11 --dev 6
#      Once speakers.csv is filled in: decides by speaker who is in test, dev and train, balanced by
#      age band, and writes splits.json and recordings.jsonl (B.5). Done before labelling, so the
#      teacher can label the dev children first.
#
#   3. import-labels  python scripts/prepare_dataset.py import-labels <tibyan-eval> <sheet.csv>
#      Checks the teacher's sheet and writes labels.jsonl (B.6). Can run again on a sheet that is
#      not finished yet. One teacher labels every word, so there are no rounds: each label is final.
#
#   4. freeze         python scripts/prepare_dataset.py freeze <tibyan-eval>
#      Once every test recording is labelled: stores the SHA-256 of recordings.jsonl and labels.jsonl
#      in splits.json (B.7). After this, scripts/evaluate.py --split test refuses changed data.
#
# Every step prints counts and problems only: never a word of a child's reading or a teacher's note.
import argparse
import csv
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.evaluation import sha256_of  # noqa: E402
from app.policy import CODES  # noqa: E402
from app.reference import get_ayah  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
DATASETS = REPO / "datasets"  # ignored by git and by Docker builds

AGE_BANDS = ["6-8", "9-11", "12-14"]
DECISIONS = ["correct", "needs_practice", "poor_audio"]
SPEAKER_FOLDER = re.compile(r"^SPK_(\d{3})$")
AUDIO_FILE = re.compile(r"^(\d{3})_(\d{3})\.wav$")

SPEAKER_COLUMNS = ["speakerId", "ageBand", "consentId", "device", "recordedAt"]
SHEET_COLUMNS = ["recordingId", "surah", "ayah", "wordIndex", "word", "teacherDecision", "errorCodes", "notes"]
DEFAULT_TEACHER = "TCH_01"  # one teacher labels every word, so no rounds and no annotator column


def recording_id(speaker_number, surah, ayah):
    """REC_<speaker>_<surah>_<ayah>, for example REC_001_112_003. The same file always gets the same id."""
    return f"REC_{speaker_number}_{surah:03d}_{ayah:03d}"


def parse_recording_id(rec_id):
    """(speakerId, surah, ayah) from a recording id."""
    _, speaker_number, surah, ayah = rec_id.split("_")
    return f"SPK_{speaker_number}", int(surah), int(ayah)


def refuse_inside_repo(folder):
    """Stops the script when folder is in the repository (it is public), except in datasets/,
    which .gitignore and .dockerignore both leave out."""
    path = Path(folder).resolve()
    if path.is_relative_to(REPO) and not path.is_relative_to(DATASETS):
        sys.exit(f"{folder} is in the repository: the dataset holds children's voices, use datasets/ or a folder outside")


def write_jsonl(path, rows):
    """Writes rows as a .jsonl file."""
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


def write_csv(path, columns, rows):
    """Writes a CSV that Excel opens with Arabic text intact (UTF-8 with BOM)."""
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def read_csv(path):
    """The rows of a CSV written by write_csv (or saved again by Excel)."""
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def recording_ids(out):
    """The ids of the recordings in out/audio, sorted."""
    return sorted(path.stem for path in (out / "audio").glob("REC_*.wav"))


# ---------- layout (step 1) ----------


def find_recordings(source):
    """([(speaker number, surah, ayah, path)], problems) for every SPK_xxx folder under source."""
    found, problems = [], []
    speaker_folders = sorted(p for p in Path(source).rglob("SPK_*") if p.is_dir())
    for folder in speaker_folders:
        match = SPEAKER_FOLDER.match(folder.name)
        if not match:
            problems.append(f"{folder.name}: folder name is not SPK_ and three digits")
            continue
        for path in sorted(folder.iterdir()):
            name = AUDIO_FILE.match(path.name)
            if not name:
                problems.append(f"{folder.name}/{path.name}: not <surah>_<ayah>.wav")
                continue
            surah, ayah = int(name.group(1)), int(name.group(2))
            if get_ayah(surah, ayah) is None:
                problems.append(f"{folder.name}/{path.name}: {surah}:{ayah} is not one of the 25 prototype ayat")
                continue
            found.append((match.group(1), surah, ayah, path))
    return found, problems


def sheet_rows(rec_id):
    """One empty labelling row per word of the recording's ayah."""
    _, surah, ayah = parse_recording_id(rec_id)
    rows = []
    for position, word in enumerate(get_ayah(surah, ayah)["words"], 1):
        rows.append({
            "recordingId": rec_id, "surah": surah, "ayah": ayah, "wordIndex": position, "word": word["text"],
            "teacherDecision": "", "errorCodes": "", "notes": "",
        })
    return rows


def layout(source, out):
    """Copies the audio and writes speakers.csv and labelling_sheet.csv. Returns the problems found."""
    refuse_inside_repo(out)
    out = Path(out)
    if out.exists() and any(out.iterdir()):
        sys.exit(f"{out} is not empty: layout only writes a new folder")

    found, problems = find_recordings(source)
    if problems:
        return problems  # nothing is copied until every file is named right
    if not found:
        sys.exit(f"No SPK_xxx/<surah>_<ayah>.wav recordings under {source}")

    (out / "audio").mkdir(parents=True)
    for speaker_number, surah, ayah, path in found:
        shutil.copy2(path, out / "audio" / f"{recording_id(speaker_number, surah, ayah)}.wav")

    speakers = sorted({f"SPK_{number}" for number, _, _, _ in found})
    write_csv(out / "speakers.csv", SPEAKER_COLUMNS, [{"speakerId": s} for s in speakers])
    write_csv(out / "labelling_sheet.csv", SHEET_COLUMNS, [row for rec in recording_ids(out) for row in sheet_rows(rec)])

    per_speaker = {}
    for number, _, _, _ in found:
        per_speaker[number] = per_speaker.get(number, 0) + 1
    short = {f"SPK_{n}": count for n, count in per_speaker.items() if count != 25}

    print(f"{len(found)} recordings of {len(speakers)} speakers copied to {out / 'audio'}")
    if short:
        print(f"Note: speakers without all 25 ayat: {short}")
    print("Next: fill in speakers.csv, and give the teacher labelling_sheet.csv and the audio folder")
    return []


# ---------- import-labels (step 3) ----------


def split_codes(text):
    """The error codes of one cell: separated by ; or , or spaces."""
    return [code for code in re.split(r"[;,\s]+", text.strip()) if code]


def check_label(row, known_recordings, teacher):
    """(label, problem): one labels.jsonl row from one sheet row, or the reason it is wrong."""
    rec_id = row.get("recordingId", "").strip()
    if rec_id not in known_recordings:
        return None, f"unknown recordingId {rec_id!r}"
    _, surah, ayah = parse_recording_id(rec_id)
    word_count = len(get_ayah(surah, ayah)["words"])
    where = f"{rec_id} word {row.get('wordIndex')}"

    try:
        word_index = int(row["wordIndex"])
    except (KeyError, ValueError):
        return None, f"{where}: wordIndex must be a number"
    if not 1 <= word_index <= word_count:
        return None, f"{where}: the ayah has {word_count} words"

    decision = row.get("teacherDecision", "").strip()
    codes = split_codes(row.get("errorCodes", ""))
    if decision not in DECISIONS:
        return None, f"{where}: teacherDecision must be one of {DECISIONS}"
    unknown = [code for code in codes if code not in CODES]
    if unknown:
        return None, f"{where}: unknown error codes {unknown}"
    if decision == "needs_practice" and not codes:
        return None, f"{where}: needs_practice needs at least one error code"
    if decision != "needs_practice" and codes:
        return None, f"{where}: only needs_practice has error codes"

    # One teacher, one label per word: it is the final label, so it is stored as round 1 (B.6 format)
    label = {
        "recordingId": rec_id, "wordIndex": word_index, "annotatorId": teacher, "round": 1,
        "teacherDecision": decision, "errorCodes": codes, "notes": row.get("notes", "").strip(),
    }
    return label, None


def is_frozen(out):
    """True once freeze has stored the hashes in splits.json."""
    path = Path(out) / "splits.json"
    return path.exists() and "sha256" in json.loads(path.read_text(encoding="utf-8"))


def read_labels(out):
    """The rows of labels.jsonl, or [] before any labels were imported."""
    path = Path(out) / "labels.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def import_labels(out, sheet, teacher=DEFAULT_TEACHER):
    """Writes labels.jsonl from the teacher's sheet (finished or not). Returns the problems found (nothing is written then)."""
    out = Path(out)
    if is_frozen(out):
        sys.exit("The dataset is frozen: labels cannot change (B.7)")

    known = set(recording_ids(out))
    labels, problems, empty_rows = [], [], 0
    seen = set()
    for line, row in enumerate(read_csv(sheet), 2):
        if not row.get("teacherDecision", "").strip():
            empty_rows += 1
            continue
        label, problem = check_label(row, known, teacher)
        if problem:
            problems.append(f"line {line}: {problem}")
            continue
        key = (label["recordingId"], label["wordIndex"])
        if key in seen:
            problems.append(f"line {line}: {key[0]} word {key[1]} appears twice")
            continue
        seen.add(key)
        labels.append(label)

    if problems:
        return problems
    write_jsonl(out / "labels.jsonl", labels)
    labelled = len({label["recordingId"] for label in labels})
    print(f"{len(labels)} word labels for {labelled} of {len(known)} recordings written to labels.jsonl")
    print(f"{empty_rows} rows without a teacherDecision were skipped")
    if (out / "splits.json").exists():
        write_recordings(out)  # audioQuality follows the new labels
    return []


# ---------- split (step 2) ----------


def final_decisions(labels):
    """{recordingId: [teacherDecision per word]}. One teacher, so every label is final."""
    decisions = {}
    for label in labels:
        decisions.setdefault(label["recordingId"], []).append(label["teacherDecision"])
    return decisions


def check_speakers(rows, speakers):
    """The problems of speakers.csv: every speaker needs an age band and a consent id."""
    by_id = {row.get("speakerId", "").strip(): row for row in rows}
    problems = []
    for speaker in speakers:
        row = by_id.get(speaker)
        if row is None:
            problems.append(f"{speaker}: missing from speakers.csv")
            continue
        if row.get("ageBand", "").strip() not in AGE_BANDS:
            problems.append(f"{speaker}: ageBand must be one of {AGE_BANDS}")
        if not row.get("consentId", "").strip():
            problems.append(f"{speaker}: consentId is empty (model-use consent, SEC-017)")
    return problems


def assign_splits(speakers_by_band, test_count, dev_count):
    """{"test": [...], "dev": [...], "train": [...]}: speakers taken in turn from each age band, so every split is balanced."""
    bands = [band for band in AGE_BANDS if band in speakers_by_band]  # youngest first
    queues = {band: sorted(speakers_by_band[band]) for band in bands}
    order = []
    while any(queues.values()):
        for band in bands:
            if queues[band]:
                order.append(queues[band].pop(0))
    return {
        "train": sorted(order[test_count + dev_count:]),
        "dev": sorted(order[test_count:test_count + dev_count]),
        "test": sorted(order[:test_count]),
    }


def speaker_info(out):
    """{speakerId: its speakers.csv row}."""
    return {row["speakerId"].strip(): row for row in read_csv(Path(out) / "speakers.csv")}


def write_recordings(out):
    """Writes recordings.jsonl (B.5) from audio/, speakers.csv, splits.json and the labels so far."""
    out = Path(out)
    info = speaker_info(out)
    splits = json.loads((out / "splits.json").read_text(encoding="utf-8"))
    split_of = {speaker: name for name in ["train", "dev", "test"] for speaker in splits[name]}
    decisions = final_decisions(read_labels(out))

    recordings = []
    for rec in recording_ids(out):
        speaker, surah, ayah = parse_recording_id(rec)
        row = info[speaker]
        recordings.append({
            "recordingId": rec,
            "speakerId": speaker,
            "consentId": row["consentId"].strip(),
            "source": "child",
            "ageBand": row["ageBand"].strip(),
            "surah": surah,
            "ayah": ayah,
            "device": row.get("device", "").strip() or None,
            "mimeType": "audio/wav",
            "recordedAt": row.get("recordedAt", "").strip() or None,
            "audioQuality": "poor_audio" if "poor_audio" in decisions.get(rec, []) else "ok",
            "split": split_of[speaker],
        })
    write_jsonl(out / "recordings.jsonl", recordings)


def split(out, test_count, dev_count):
    """Decides who is in test, dev and train; writes splits.json and recordings.jsonl. Returns the problems found."""
    out = Path(out)
    if (out / "splits.json").exists():
        sys.exit("splits.json exists: the split is already decided (B.7)")

    speakers = sorted({parse_recording_id(rec)[0] for rec in recording_ids(out)})
    problems = check_speakers(read_csv(out / "speakers.csv"), speakers)
    if test_count + dev_count > len(speakers):
        problems.append(f"--test {test_count} --dev {dev_count} needs more than the {len(speakers)} speakers")
    if problems:
        return problems

    info = speaker_info(out)
    by_band = {}
    for speaker in speakers:
        by_band.setdefault(info[speaker]["ageBand"].strip(), []).append(speaker)
    splits = assign_splits(by_band, test_count, dev_count)
    (out / "splits.json").write_text(json.dumps(splits, indent=2), encoding="utf-8")
    write_recordings(out)

    for name in ["test", "dev", "train"]:
        bands = {}
        for speaker in splits[name]:
            band = info[speaker]["ageBand"].strip()
            bands[band] = bands.get(band, 0) + 1
        print(f"{name:<5} {len(splits[name]):>2} speakers  by age band: {bands}")
    print(f"Dev speakers, to label first: {', '.join(splits['dev'])}")
    return []


# ---------- freeze (step 4) ----------


def freeze(out):
    """Stores the SHA-256 of recordings.jsonl and labels.jsonl in splits.json. Returns the problems found."""
    out = Path(out)
    if not (out / "splits.json").exists():
        sys.exit("No splits.json: run split first")
    if is_frozen(out):
        sys.exit("The dataset is already frozen (B.7)")
    if not (out / "labels.jsonl").exists():
        sys.exit("No labels.jsonl: run import-labels first")

    splits = json.loads((out / "splits.json").read_text(encoding="utf-8"))
    decisions = final_decisions(read_labels(out))
    test_unlabelled = [
        rec for rec in recording_ids(out) if parse_recording_id(rec)[0] in splits["test"] and rec not in decisions
    ]
    if test_unlabelled:
        return [f"{len(test_unlabelled)} test recordings have no labels yet: finish labelling before freezing"]

    write_recordings(out)
    splits["sha256"] = {name: sha256_of(out / name) for name in ["recordings.jsonl", "labels.jsonl"]}
    (out / "splits.json").write_text(json.dumps(splits, indent=2), encoding="utf-8")
    unlabelled = sum(1 for rec in recording_ids(out) if rec not in decisions)
    print(f"{len(recording_ids(out))} recordings, {unlabelled} without labels (left out of every run)")
    print("Frozen. Tune on --split dev only; run --split test once, at the end (B.7)")
    return []


def main():
    """Runs one step and prints its problems, if any."""
    parser = argparse.ArgumentParser(description="Prepare the children's evaluation dataset (dataset doc, B.4 to B.7)")
    steps = parser.add_subparsers(dest="step", required=True)

    step = steps.add_parser("layout", help="copy the audio and write the sheets to fill in")
    step.add_argument("source", type=Path, help="folder with SPK_xxx/<surah>_<ayah>.wav")
    step.add_argument("out", type=Path, help="the new tibyan-eval folder: datasets/tibyan-eval or outside the repository")

    step = steps.add_parser("split", help="decide test, dev and train by speaker, balanced by age band")
    step.add_argument("out", type=Path)
    step.add_argument("--test", type=int, default=11, help="speakers in the test split (default 11)")
    step.add_argument("--dev", type=int, default=6, help="speakers in the dev split (default 6)")

    step = steps.add_parser("import-labels", help="check the teacher's sheet and write labels.jsonl")
    step.add_argument("out", type=Path)
    step.add_argument("sheet", type=Path, help="the teacher's labelling_sheet.csv, finished or not")
    step.add_argument("--teacher", default=DEFAULT_TEACHER, help=f"the teacher's anonymous id (default {DEFAULT_TEACHER})")

    step = steps.add_parser("freeze", help="store the hashes, so the test data can no longer change")
    step.add_argument("out", type=Path)

    args = parser.parse_args()
    if args.step == "layout":
        problems = layout(args.source, args.out)
    elif args.step == "split":
        problems = split(args.out, args.test, args.dev)
    elif args.step == "import-labels":
        problems = import_labels(args.out, args.sheet, args.teacher)
    else:
        problems = freeze(args.out)

    if problems:
        print(f"{len(problems)} problems:")
        for problem in problems:
            print(f"  - {problem}")
        sys.exit(1)


if __name__ == "__main__":
    main()
