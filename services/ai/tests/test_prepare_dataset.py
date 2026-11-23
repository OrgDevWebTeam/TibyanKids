# scripts/prepare_dataset.py on synthetic folders: fake .wav bytes, never a real recording.
import csv
import importlib.util
import json
from pathlib import Path

import pytest

from app import evaluation

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "prepare_dataset.py"
spec = importlib.util.spec_from_file_location("prepare_dataset", SCRIPT)
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)

AYAT = ["112_001", "112_002"]  # 112:1 has 4 words, 112:2 has 2 words
BANDS = {"SPK_001": "6-8", "SPK_002": "6-8", "SPK_003": "9-11", "SPK_004": "9-11", "SPK_005": "12-14", "SPK_006": "12-14"}


def make_source(root, speakers=BANDS, ayat=AYAT):
    """source/Tibyan_Dataset/SPK_xxx/<surah>_<ayah>.wav with fake bytes (the real data is nested like this)."""
    for speaker in speakers:
        folder = root / "Tibyan_Dataset" / speaker
        folder.mkdir(parents=True)
        for ayah in ayat:
            (folder / f"{ayah}.wav").write_bytes(b"RIFF fake")
    return root


def fill_speakers(out, bands=BANDS):
    """speakers.csv with an age band and a consent id for every speaker."""
    rows = [{"speakerId": s, "ageBand": band, "consentId": f"CON_{s[4:]}"} for s, band in bands.items()]
    prepare.write_csv(out / "speakers.csv", prepare.SPEAKER_COLUMNS, rows)


def teacher_sheet(out, path, decision_of=lambda row: ("correct", "")):
    """A copy of labelling_sheet.csv with every row filled in by the teacher."""
    rows = prepare.read_csv(out / "labelling_sheet.csv")
    for row in rows:
        row["teacherDecision"], row["errorCodes"] = decision_of(row)
    prepare.write_csv(path, prepare.SHEET_COLUMNS, rows)
    return path


@pytest.fixture
def out(tmp_path):
    """A laid-out dataset of 6 speakers and 2 ayat each."""
    folder = tmp_path / "tibyan-eval"
    assert prepare.layout(make_source(tmp_path / "source"), folder) == []
    return folder


def test_layout_copies_every_recording_with_a_stable_id(out):
    assert prepare.recording_ids(out)[:2] == ["REC_001_112_001", "REC_001_112_002"]
    assert len(prepare.recording_ids(out)) == 12


def test_layout_writes_one_sheet_row_per_word(out):
    rows = prepare.read_csv(out / "labelling_sheet.csv")
    assert len(rows) == 6 * (4 + 2)
    assert [row["wordIndex"] for row in rows[:6]] == ["1", "2", "3", "4", "1", "2"]
    assert rows[0]["word"]  # the Arabic word, so the teacher sees what to listen for


def test_layout_lists_every_speaker_in_speakers_csv(out):
    assert [row["speakerId"] for row in prepare.read_csv(out / "speakers.csv")] == list(BANDS)


def test_layout_refuses_a_folder_in_the_repository_outside_datasets(tmp_path):
    with pytest.raises(SystemExit):
        prepare.layout(make_source(tmp_path / "source"), prepare.REPO / "services" / "ai" / "tibyan-eval")


@pytest.mark.parametrize("ignore_file", [".gitignore", ".dockerignore"])
def test_datasets_folder_is_allowed_because_git_and_docker_ignore_it(ignore_file):
    prepare.refuse_inside_repo(prepare.DATASETS / "tibyan-eval")  # does not stop the script
    lines = (prepare.REPO / ignore_file).read_text(encoding="utf-8").splitlines()
    assert any(line.strip() in ("datasets", "datasets/") for line in lines)


def test_layout_copies_nothing_when_a_file_is_misnamed(tmp_path):
    source = make_source(tmp_path / "source")
    (source / "Tibyan_Dataset" / "SPK_001" / "fatiha one.wav").write_bytes(b"RIFF")
    problems = prepare.layout(source, tmp_path / "tibyan-eval")
    assert len(problems) == 1 and "fatiha one.wav" in problems[0]
    assert not (tmp_path / "tibyan-eval").exists()


def test_layout_rejects_an_ayah_outside_the_prototype(tmp_path):
    source = make_source(tmp_path / "source", ayat=["002_255"])
    problems = prepare.layout(source, tmp_path / "tibyan-eval")
    assert all("not one of the 25 prototype ayat" in p for p in problems)


def test_layout_sheet_has_no_teacher_or_round_columns(out):
    with open(out / "labelling_sheet.csv", encoding="utf-8-sig") as f:
        header = f.readline().strip().split(",")
    assert "annotatorId" not in header and "round" not in header


def test_import_writes_one_final_label_per_word(out, tmp_path):
    assert prepare.import_labels(out, teacher_sheet(out, tmp_path / "a.csv")) == []
    labels = evaluation.read_jsonl(out / "labels.jsonl")
    assert len(labels) == 36
    assert labels[0] == {
        "recordingId": "REC_001_112_001", "wordIndex": 1, "annotatorId": "TCH_01", "round": 1,
        "teacherDecision": "correct", "errorCodes": [], "notes": "",
    }


def test_import_labels_are_all_gold_for_evaluate(out, tmp_path):
    """evaluate.py reads one round-1 label per word as the final label: nothing is left unresolved."""
    prepare.import_labels(out, teacher_sheet(out, tmp_path / "a.csv"))
    gold, unresolved = evaluation.gold_labels(evaluation.read_jsonl(out / "labels.jsonl"))
    assert len(gold) == 12 and unresolved == set()


def test_import_uses_the_teacher_id_given(out, tmp_path):
    prepare.import_labels(out, teacher_sheet(out, tmp_path / "a.csv"), teacher="TCH_07")
    assert {label["annotatorId"] for label in evaluation.read_jsonl(out / "labels.jsonl")} == {"TCH_07"}


def test_import_splits_codes_and_skips_rows_not_filled_in(out, tmp_path):
    rows = prepare.read_csv(out / "labelling_sheet.csv")
    rows[0].update(teacherDecision="needs_practice", errorCodes="ERR_MEM_OMISSION; ERR_PRON_HARAKA")
    prepare.write_csv(tmp_path / "a.csv", prepare.SHEET_COLUMNS, rows)
    assert prepare.import_labels(out, tmp_path / "a.csv") == []
    labels = evaluation.read_jsonl(out / "labels.jsonl")
    assert len(labels) == 1
    assert labels[0]["errorCodes"] == ["ERR_MEM_OMISSION", "ERR_PRON_HARAKA"]


@pytest.mark.parametrize(
    "change, problem",
    [
        ({"errorCodes": "ERR_MADE_UP", "teacherDecision": "needs_practice"}, "unknown error codes"),
        ({"teacherDecision": "needs_practice"}, "needs at least one error code"),
        ({"errorCodes": "ERR_MEM_OMISSION"}, "only needs_practice has error codes"),
        ({"teacherDecision": "maybe"}, "teacherDecision must be one of"),
        ({"wordIndex": "9"}, "the ayah has 4 words"),
        ({"wordIndex": "two"}, "wordIndex must be a number"),
        ({"recordingId": "REC_099_112_001"}, "unknown recordingId"),
    ],
)
def test_import_refuses_a_wrong_row_and_writes_nothing(out, tmp_path, change, problem):
    rows = prepare.read_csv(out / "labelling_sheet.csv")[:1]
    rows[0].update(teacherDecision="correct")
    rows[0].update(change)
    prepare.write_csv(tmp_path / "a.csv", prepare.SHEET_COLUMNS, rows)
    problems = prepare.import_labels(out, tmp_path / "a.csv")
    assert len(problems) == 1 and problem in problems[0]
    assert not (out / "labels.jsonl").exists()


def test_import_refuses_the_same_word_twice(out, tmp_path):
    rows = prepare.read_csv(out / "labelling_sheet.csv")[:1] * 2
    rows[0]["teacherDecision"] = "correct"
    prepare.write_csv(tmp_path / "a.csv", prepare.SHEET_COLUMNS, rows)
    problems = prepare.import_labels(out, tmp_path / "a.csv")
    assert problems and "appears twice" in problems[0]


def labelled(out, tmp_path, decision_of=lambda row: ("correct", "")):
    """The teacher's labels for every word."""
    assert prepare.import_labels(out, teacher_sheet(out, tmp_path / "teacher.csv", decision_of)) == []


def test_freeze_splits_by_speaker_balanced_by_age_band(out, tmp_path):
    labelled(out, tmp_path)
    fill_speakers(out)
    assert prepare.freeze(out, test_count=3, dev_count=2) == []
    splits = json.loads((out / "splits.json").read_text(encoding="utf-8"))
    assert splits["test"] == ["SPK_001", "SPK_003", "SPK_005"]  # one from each age band
    assert sorted(splits["dev"] + splits["train"] + splits["test"]) == list(BANDS)
    assert set(splits["dev"]).isdisjoint(splits["test"])


def test_freeze_writes_recordings_that_evaluate_accepts_as_frozen(out, tmp_path):
    labelled(out, tmp_path)
    fill_speakers(out)
    prepare.freeze(out, test_count=3, dev_count=2)
    splits = json.loads((out / "splits.json").read_text(encoding="utf-8"))
    assert evaluation.check_frozen(out, splits)
    recordings = evaluation.read_jsonl(out / "recordings.jsonl")
    assert recordings[0] == {
        "recordingId": "REC_001_112_001", "speakerId": "SPK_001", "consentId": "CON_001", "source": "child",
        "ageBand": "6-8", "surah": 112, "ayah": 1, "device": None, "mimeType": "audio/wav",
        "recordedAt": None, "audioQuality": "ok", "split": "test",
    }


def test_freeze_marks_poor_audio_from_the_teachers(out, tmp_path):
    poor = lambda row: ("poor_audio", "") if row["recordingId"] == "REC_002_112_001" else ("correct", "")  # noqa: E731
    labelled(out, tmp_path, poor)
    fill_speakers(out)
    prepare.freeze(out, test_count=3, dev_count=2)
    quality = {r["recordingId"]: r["audioQuality"] for r in evaluation.read_jsonl(out / "recordings.jsonl")}
    assert quality["REC_002_112_001"] == "poor_audio"
    assert quality["REC_001_112_001"] == "ok"


def test_freeze_needs_an_age_band_and_consent_for_every_speaker(out, tmp_path):
    labelled(out, tmp_path)
    problems = prepare.freeze(out, test_count=3, dev_count=2)  # speakers.csv not filled in
    assert len(problems) == 2 * 6
    assert not (out / "splits.json").exists()


def test_freeze_only_once(out, tmp_path):
    labelled(out, tmp_path)
    fill_speakers(out)
    prepare.freeze(out, test_count=3, dev_count=2)
    with pytest.raises(SystemExit):
        prepare.freeze(out, test_count=3, dev_count=2)
    with pytest.raises(SystemExit):
        prepare.import_labels(out, tmp_path / "teacher.csv")


def test_unused_csv_columns_do_not_break_the_import(out, tmp_path):
    """Excel may add empty columns; DictReader keeps them under other keys."""
    path = teacher_sheet(out, tmp_path / "a.csv")
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        csv.writer(f).writerows([row + [""] for row in rows])
    assert prepare.import_labels(out, path) == []
