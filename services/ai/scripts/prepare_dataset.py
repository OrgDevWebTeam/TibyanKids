# The children's recordings into the evaluation layout: layout, split, import-labels, freeze (B.4-B.7).
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
DATASETS = REPO / "datasets"

AGE_BANDS = ["6-8", "9-11", "12-14"]
DECISIONS = ["correct", "needs_practice", "poor_audio"]
SPEAKER_FOLDER = re.compile(r"^SPK_(\d{3})$")
AUDIO_FILE = re.compile(r"^(\d{3})_(\d{3})\.wav$")

SPEAKER_COLUMNS = ["speakerId", "ageBand", "consentId", "device", "recordedAt"]
SHEET_COLUMNS = [
    "recordingId", "surah", "ayah", "wordIndex", "word", "teacherDecision", "errorCodes", "notes",
]
DEFAULT_TEACHER = "TCH_01"


def recording_id(speaker_number, surah, ayah):
    """REC_<speaker>_<surah>_<ayah>, for example REC_001_112_003. A file always gets the same id."""
    return f"REC_{speaker_number}_{surah:03d}_{ayah:03d}"


def parse_recording_id(rec_id):
    """(speakerId, surah, ayah) from a recording id."""
    _, speaker_number, surah, ayah = rec_id.split("_")
    return f"SPK_{speaker_number}", int(surah), int(ayah)


def speaker_of(rec_id):
    """The speakerId of a recording id."""
    return parse_recording_id(rec_id)[0]


def refuse_inside_repo(folder):
    """Stops the script for a folder in the public repository, except datasets/."""
    path = Path(folder).resolve()
    if path.is_relative_to(REPO) and not path.is_relative_to(DATASETS):
        sys.exit(f"{folder} is in the repository: the dataset holds children's voices, "
                 "use datasets/ or a folder outside")


def write_jsonl(path, rows):
    """Writes rows as a .jsonl file: one JSON object per line."""
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


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


def read_labels(out):
    """The rows of labels.jsonl, or [] before any labels were imported."""
    path = Path(out) / "labels.jsonl"
    if not path.exists():
        return []
    labels = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line:
            labels.append(json.loads(line))
    return labels


def read_splits(out):
    """The contents of splits.json."""
    return json.loads((Path(out) / "splits.json").read_text(encoding="utf-8"))


def is_frozen(out):
    """True once freeze has stored the hashes in splits.json."""
    return (Path(out) / "splits.json").exists() and "sha256" in read_splits(out)


def print_problems(problems):
    """Prints the problems found, one per line."""
    print(f"{len(problems)} problems:")
    for problem in problems:
        print(f"  - {problem}")


def find_audio_files(folder):
    """([(speaker number, surah, ayah, path)], problems) for one SPK_xxx folder."""
    speaker_number = SPEAKER_FOLDER.match(folder.name).group(1)
    found, problems = [], []
    for path in sorted(folder.iterdir()):
        name = AUDIO_FILE.match(path.name)
        if not name:
            problems.append(f"{folder.name}/{path.name}: not <surah>_<ayah>.wav")
            continue
        surah, ayah = int(name.group(1)), int(name.group(2))
        if get_ayah(surah, ayah) is None:
            problems.append(f"{folder.name}/{path.name}: {surah}:{ayah} is not one of the 25 prototype ayat")
            continue
        found.append((speaker_number, surah, ayah, path))
    return found, problems


def find_recordings(source):
    """([(speaker number, surah, ayah, path)], problems) for every SPK_xxx folder."""
    found, problems = [], []
    for folder in sorted(Path(source).rglob("SPK_*")):
        if not folder.is_dir():
            continue
        if not SPEAKER_FOLDER.match(folder.name):
            problems.append(f"{folder.name}: folder name is not SPK_ and three digits")
            continue
        folder_found, folder_problems = find_audio_files(folder)
        found += folder_found
        problems += folder_problems
    return found, problems


def sheet_rows(rec_id):
    """One empty labelling row per word of the recording's ayah, with the word for the teacher."""
    _, surah, ayah = parse_recording_id(rec_id)
    rows = []
    for position, word in enumerate(get_ayah(surah, ayah)["words"], 1):
        row = {"recordingId": rec_id, "surah": surah, "ayah": ayah, "wordIndex": position}
        row.update({"word": word["text"], "teacherDecision": "", "errorCodes": "", "notes": ""})
        rows.append(row)
    return rows


def copy_audio(found, out):
    """Copies each recording to out/audio/<recordingId>.wav."""
    (out / "audio").mkdir(parents=True)
    for speaker_number, surah, ayah, path in found:
        shutil.copy2(path, out / "audio" / f"{recording_id(speaker_number, surah, ayah)}.wav")


def write_sheets(out, speakers):
    """Writes speakers.csv (one empty row per speaker) and labelling_sheet.csv (one row per word)."""
    speaker_rows = [{"speakerId": speaker} for speaker in speakers]
    write_csv(out / "speakers.csv", SPEAKER_COLUMNS, speaker_rows)
    word_rows = []
    for rec_id in recording_ids(out):
        word_rows += sheet_rows(rec_id)
    write_csv(out / "labelling_sheet.csv", SHEET_COLUMNS, word_rows)


def speakers_without_all_ayat(found):
    """{speakerId: recordings} for every speaker who does not have all 25 ayat."""
    counts = {}
    for speaker_number, _, _, _ in found:
        speaker = f"SPK_{speaker_number}"
        counts[speaker] = counts.get(speaker, 0) + 1
    return {speaker: count for speaker, count in counts.items() if count != 25}


def layout(source, out):
    """Copies the audio and writes speakers.csv and labelling_sheet.csv. Returns the problems found."""
    refuse_inside_repo(out)
    out = Path(out)
    if out.exists() and any(out.iterdir()):
        sys.exit(f"{out} is not empty: layout only writes a new folder")

    found, problems = find_recordings(source)
    if problems:
        return problems
    if not found:
        sys.exit(f"No SPK_xxx/<surah>_<ayah>.wav recordings under {source}")

    copy_audio(found, out)
    speakers = sorted({f"SPK_{number}" for number, _, _, _ in found})
    write_sheets(out, speakers)

    print(f"{len(found)} recordings of {len(speakers)} speakers copied to {out / 'audio'}")
    missing = speakers_without_all_ayat(found)
    if missing:
        print(f"Note: speakers without all 25 ayat: {missing}")
    print("Next: fill in speakers.csv, and give the teacher labelling_sheet.csv and the audio folder")
    return []


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


def speaker_info(out):
    """{speakerId: its speakers.csv row}."""
    info = {}
    for row in read_csv(Path(out) / "speakers.csv"):
        info[row["speakerId"].strip()] = row
    return info


def age_band_of(info, speaker):
    """The age band of a speaker, from speakers.csv."""
    return info[speaker]["ageBand"].strip()


def speakers_in_turn(speakers_by_band):
    """All speakers, one from each age band in turn, youngest first."""
    queues = []
    for band in AGE_BANDS:
        if band in speakers_by_band:
            queues.append(sorted(speakers_by_band[band]))
    order = []
    while any(queues):
        for queue in queues:
            if queue:
                order.append(queue.pop(0))
    return order


def assign_splits(speakers_by_band, test_count, dev_count):
    """{"train": [...], "dev": [...], "test": [...]}: test first, then dev, then the rest."""
    order = speakers_in_turn(speakers_by_band)
    test = order[:test_count]
    dev = order[test_count:test_count + dev_count]
    train = order[test_count + dev_count:]
    return {"train": sorted(train), "dev": sorted(dev), "test": sorted(test)}


def final_decisions(labels):
    """{recordingId: [teacherDecision per word]}. One teacher, so every label is final."""
    decisions = {}
    for label in labels:
        decisions.setdefault(label["recordingId"], []).append(label["teacherDecision"])
    return decisions


def split_of_each_speaker(splits):
    """{speakerId: "train", "dev" or "test"}."""
    split_of = {}
    for name in ["train", "dev", "test"]:
        for speaker in splits[name]:
            split_of[speaker] = name
    return split_of


def recording_row(rec_id, info, split_of, decisions):
    """One recordings.jsonl row (B.5). audioQuality is poor_audio when the teacher said so."""
    speaker, surah, ayah = parse_recording_id(rec_id)
    row = info[speaker]
    poor = "poor_audio" in decisions.get(rec_id, [])
    return {
        "recordingId": rec_id,
        "speakerId": speaker,
        "consentId": row["consentId"].strip(),
        "source": "child",
        "ageBand": row["ageBand"].strip(),
        "surah": surah,
        "ayah": ayah,
        "device": row.get("device", "").strip() or None,
        "mimeType": "audio/wav",
        "recordedAt": row.get("recordedAt", "").strip() or None,
        "audioQuality": "poor_audio" if poor else "ok",
        "split": split_of[speaker],
    }


def write_recordings(out):
    """Writes recordings.jsonl from audio/, speakers.csv, splits.json and the labels so far."""
    out = Path(out)
    info = speaker_info(out)
    split_of = split_of_each_speaker(read_splits(out))
    decisions = final_decisions(read_labels(out))
    rows = [recording_row(rec_id, info, split_of, decisions) for rec_id in recording_ids(out)]
    write_jsonl(out / "recordings.jsonl", rows)


def print_split(splits, info):
    """How many speakers of each age band are in each split, and the dev speakers to label first."""
    for name in ["test", "dev", "train"]:
        bands = {}
        for speaker in splits[name]:
            band = age_band_of(info, speaker)
            bands[band] = bands.get(band, 0) + 1
        print(f"{name:<5} {len(splits[name]):>2} speakers  by age band: {bands}")
    print(f"Dev speakers, to label first: {', '.join(splits['dev'])}")


def split(out, test_count, dev_count):
    """Decides test, dev and train; writes splits.json and recordings.jsonl. Returns problems."""
    out = Path(out)
    if (out / "splits.json").exists():
        sys.exit("splits.json exists: the split is already decided (B.7)")

    speakers = sorted({speaker_of(rec_id) for rec_id in recording_ids(out)})
    problems = check_speakers(read_csv(out / "speakers.csv"), speakers)
    if test_count + dev_count > len(speakers):
        problems.append(f"--test {test_count} --dev {dev_count} needs more than the {len(speakers)} speakers")
    if problems:
        return problems

    info = speaker_info(out)
    speakers_by_band = {}
    for speaker in speakers:
        speakers_by_band.setdefault(age_band_of(info, speaker), []).append(speaker)
    splits = assign_splits(speakers_by_band, test_count, dev_count)
    (out / "splits.json").write_text(json.dumps(splits, indent=2), encoding="utf-8")
    write_recordings(out)
    print_split(splits, info)
    return []


def split_codes(text):
    """The error codes of one cell: separated by ; or , or spaces."""
    return [code for code in re.split(r"[;,\s]+", text.strip()) if code]


def word_index_problem(row, rec_id):
    """(word index, problem): the word number of a sheet row, or why it is wrong."""
    _, surah, ayah = parse_recording_id(rec_id)
    word_count = len(get_ayah(surah, ayah)["words"])
    try:
        word_index = int(row["wordIndex"])
    except (KeyError, ValueError):
        return None, "wordIndex must be a number"
    if not 1 <= word_index <= word_count:
        return None, f"the ayah has {word_count} words"
    return word_index, None


def decision_problem(decision, codes):
    """Why a teacherDecision and its error codes do not fit together, or None."""
    if decision not in DECISIONS:
        return f"teacherDecision must be one of {DECISIONS}"
    unknown = [code for code in codes if code not in CODES]
    if unknown:
        return f"unknown error codes {unknown}"
    if decision == "needs_practice" and not codes:
        return "needs_practice needs at least one error code"
    if decision != "needs_practice" and codes:
        return "only needs_practice has error codes"
    return None


def check_label(row, known_recordings, teacher):
    """(label, problem): one labels.jsonl row from one sheet row, or the reason it is wrong."""
    rec_id = row.get("recordingId", "").strip()
    if rec_id not in known_recordings:
        return None, f"unknown recordingId {rec_id!r}"
    where = f"{rec_id} word {row.get('wordIndex')}"

    word_index, problem = word_index_problem(row, rec_id)
    if problem:
        return None, f"{where}: {problem}"
    decision = row.get("teacherDecision", "").strip()
    codes = split_codes(row.get("errorCodes", ""))
    problem = decision_problem(decision, codes)
    if problem:
        return None, f"{where}: {problem}"

    label = {"recordingId": rec_id, "wordIndex": word_index, "annotatorId": teacher, "round": 1}
    label.update({"teacherDecision": decision, "errorCodes": codes, "notes": row.get("notes", "").strip()})
    return label, None


def labels_from_sheet(sheet, known_recordings, teacher):
    """(labels, problems, rows not filled in) for the teacher's sheet."""
    labels, problems, empty_rows = [], [], 0
    seen = set()
    for line, row in enumerate(read_csv(sheet), 2):
        if not row.get("teacherDecision", "").strip():
            empty_rows += 1
            continue
        label, problem = check_label(row, known_recordings, teacher)
        if problem:
            problems.append(f"line {line}: {problem}")
            continue
        word = (label["recordingId"], label["wordIndex"])
        if word in seen:
            problems.append(f"line {line}: {word[0]} word {word[1]} appears twice")
            continue
        seen.add(word)
        labels.append(label)
    return labels, problems, empty_rows


def import_labels(out, sheet, teacher=DEFAULT_TEACHER):
    """Writes labels.jsonl from the teacher's sheet, finished or not. Returns problems."""
    out = Path(out)
    if is_frozen(out):
        sys.exit("The dataset is frozen: labels cannot change (B.7)")

    known = set(recording_ids(out))
    labels, problems, empty_rows = labels_from_sheet(sheet, known, teacher)
    if problems:
        return problems
    write_jsonl(out / "labels.jsonl", labels)
    if (out / "splits.json").exists():
        write_recordings(out)

    labelled = len({label["recordingId"] for label in labels})
    print(f"{len(labels)} word labels for {labelled} of {len(known)} recordings written to labels.jsonl")
    print(f"{empty_rows} rows without a teacherDecision were skipped")
    return []


def unlabelled_test_recordings(out, splits, decisions):
    """The test recordings that have no label yet."""
    missing = []
    for rec_id in recording_ids(out):
        if speaker_of(rec_id) in splits["test"] and rec_id not in decisions:
            missing.append(rec_id)
    return missing


def freeze(out):
    """Stores the hashes of recordings.jsonl and labels.jsonl in splits.json. Returns problems."""
    out = Path(out)
    if not (out / "splits.json").exists():
        sys.exit("No splits.json: run split first")
    if is_frozen(out):
        sys.exit("The dataset is already frozen (B.7)")
    if not (out / "labels.jsonl").exists():
        sys.exit("No labels.jsonl: run import-labels first")

    splits = read_splits(out)
    decisions = final_decisions(read_labels(out))
    missing = unlabelled_test_recordings(out, splits, decisions)
    if missing:
        return [f"{len(missing)} test recordings have no labels yet: finish labelling before freezing"]

    write_recordings(out)
    splits["sha256"] = {
        "recordings.jsonl": sha256_of(out / "recordings.jsonl"),
        "labels.jsonl": sha256_of(out / "labels.jsonl"),
    }
    (out / "splits.json").write_text(json.dumps(splits, indent=2), encoding="utf-8")

    total = len(recording_ids(out))
    print(f"{total} recordings, {total - len(decisions)} without labels (left out of every run)")
    print("Frozen. Tune on --split dev only; run --split test once, at the end (B.7)")
    return []


def parse_arguments():
    """The step to run and its arguments."""
    parser = argparse.ArgumentParser(description="Prepare the children's evaluation dataset (B.4 to B.7)")
    steps = parser.add_subparsers(dest="step", required=True)

    step = steps.add_parser("layout", help="copy the audio and write the sheets to fill in")
    step.add_argument("source", type=Path, help="folder with SPK_xxx/<surah>_<ayah>.wav")
    step.add_argument("out", type=Path, help="the new folder: datasets/tibyan-eval or outside the repo")

    step = steps.add_parser("split", help="decide test, dev and train by speaker, balanced by age band")
    step.add_argument("out", type=Path)
    step.add_argument("--test", type=int, default=11, help="speakers in the test split (default 11)")
    step.add_argument("--dev", type=int, default=6, help="speakers in the dev split (default 6)")

    step = steps.add_parser("import-labels", help="check the teacher's sheet and write labels.jsonl")
    step.add_argument("out", type=Path)
    step.add_argument("sheet", type=Path, help="the teacher's labelling_sheet.csv, finished or not")
    step.add_argument("--teacher", default=DEFAULT_TEACHER, help="the teacher's anonymous id")

    step = steps.add_parser("freeze", help="store the hashes, so the test data can no longer change")
    step.add_argument("out", type=Path)
    return parser.parse_args()


def main():
    """Runs one step and prints its problems, if any."""
    args = parse_arguments()
    if args.step == "layout":
        problems = layout(args.source, args.out)
    elif args.step == "split":
        problems = split(args.out, args.test, args.dev)
    elif args.step == "import-labels":
        problems = import_labels(args.out, args.sheet, args.teacher)
    else:
        problems = freeze(args.out)

    if problems:
        print_problems(problems)
        sys.exit(1)


if __name__ == "__main__":
    main()
