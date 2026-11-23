# The models' raw output for one recording, saved once by scripts/run_models.py and read by the
# evaluation scripts, so the GPU runs once per model version (dataset doc, B.4 "outputs/").
#
# A saved output is what the models found before any decision: the gate result and its numbers,
# each model's findings (word, code, confidence) and the time of each step. Merging the two models,
# the word segments and the decision are worked out again when it is read, so a change to the merge
# rules, the decision policy or the threshold never needs the GPU.
#
# A saved output holds numbers and codes only: no audio, transcript or phoneme text. It still belongs
# to a child's recording, so it stays in the dataset folder, never in git, logs or telemetry.
import json
from dataclasses import dataclass
from pathlib import Path

from app import evaluation
from app.adapters import muaalem, whisper_quran
from app.combine import combine_findings
from app.evaluation import GUARD, LEVELS
from app.policy import decide
from app.reference import add_word_segments, get_word_timings
from app.schemas import Finding

COMBINED = "combined"
MODELS = [muaalem.NAME, whisper_quran.NAME, COMBINED]
TIMED_STEPS = ["decode", "gate", muaalem.NAME, whisper_quran.NAME]

UNREADABLE = "unreadable"  # the audio could not be decoded (EMPTY_AUDIO, DECODE_FAILED, DECODE_TIMEOUT)
RUN_FILE = "run.json"  # the model versions and date of a run folder


class DatasetProblem(Exception):
    """The dataset or its saved outputs cannot be used for this run; the message says why."""


@dataclass
class LabelledSplit:
    """One split of the dataset, ready to evaluate."""

    recordings: list  # the labelled recordings of the split (recordings.jsonl rows)
    gold: dict  # {recordingId: {wordIndex: [error codes]}}, the teacher's final labels
    saved: dict  # {recordingId: saved output}
    run_name: str  # the folder in outputs/ the saved outputs come from
    run_folder: Path  # that folder
    splits: dict  # the contents of splits.json
    frozen: bool  # the dataset still matches the hashes in splits.json
    unresolved: set  # recordings whose labels disagree, left out


# ---------- Files ----------


def write_output(run_folder, saved):
    """Saves one recording's output as <recordingId>.json."""
    path = Path(run_folder) / f"{saved['recordingId']}.json"
    path.write_text(json.dumps(saved, ensure_ascii=False, indent=1), encoding="utf-8")


def read_output(run_folder, recording_id):
    """One recording's saved output, or None when it was not run yet."""
    path = Path(run_folder) / f"{recording_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def read_run(run_folder):
    """The run.json of a run folder: date and model versions."""
    return json.loads((Path(run_folder) / RUN_FILE).read_text(encoding="utf-8"))


def newest_run(folder):
    """The name of the newest run folder in <tibyan-eval>/outputs/ (the names start with the date)."""
    runs = []
    for path in (Path(folder) / "outputs").glob("*"):
        if (path / RUN_FILE).exists():
            runs.append(path.name)
    if not runs:
        outputs = Path(folder) / "outputs"
        raise DatasetProblem(f"No saved outputs in {outputs}: run scripts/run_models.py first")
    return sorted(runs)[-1]


# ---------- Loading a split ----------


def labelled_recordings(folder, speakers, gold):
    """The recordings.jsonl rows of these speakers that have labels."""
    rows = []
    for row in evaluation.read_jsonl(Path(folder) / "recordings.jsonl"):
        if row["speakerId"] in speakers and row["recordingId"] in gold:
            rows.append(row)
    return rows


def saved_outputs_of(run_folder, recordings):
    """{recordingId: saved output} for these recordings; a missing one stops the run."""
    saved = {}
    for row in recordings:
        output = read_output(run_folder, row["recordingId"])
        if output is None:
            missing = row["recordingId"]
            raise DatasetProblem(f"{missing} has no saved output in {run_folder.name}: run run_models.py")
        saved[row["recordingId"]] = output
    return saved


def load_split(folder, split, run_name=None):
    """The labelled recordings of one split with their saved outputs (a LabelledSplit).
    A test split is refused unless the dataset is frozen (B.7)."""
    folder = Path(folder)
    splits = json.loads((folder / "splits.json").read_text(encoding="utf-8"))
    frozen = evaluation.check_frozen(folder, splits)
    if split == "test" and not frozen:
        raise DatasetProblem("The dataset is not frozen, or changed after freezing: no test run (B.7)")

    gold, unresolved = evaluation.gold_labels(evaluation.read_jsonl(folder / "labels.jsonl"))
    recordings = labelled_recordings(folder, set(splits[split]), gold)
    run_name = run_name or newest_run(folder)
    run_folder = folder / "outputs" / run_name
    saved = saved_outputs_of(run_folder, recordings)
    return LabelledSplit(recordings, gold, saved, run_name, run_folder, splits, frozen, unresolved)


# ---------- Decisions from a saved output ----------


def findings_of(saved, model):
    """The findings one model saved, or None when it gave no usable answer (it ran away or failed)."""
    raw = saved["findings"].get(model)
    if raw is None:
        return None
    return [Finding(**finding) for finding in raw]


def model_findings(saved):
    """{model: [Finding] or None} for each model alone and both combined.
    None means no usable answer: the ayah is uncertain, as in the service."""
    muaalem_findings = findings_of(saved, muaalem.NAME)
    whisper_findings = findings_of(saved, whisper_quran.NAME)
    if muaalem_findings is None or whisper_findings is None:
        combined = None
    else:
        combined = combine_findings(muaalem_findings, whisper_findings)
    return {muaalem.NAME: muaalem_findings, whisper_quran.NAME: whisper_findings, COMBINED: combined}


def decisions_at_every_level(findings, timings, threshold):
    """{level: (decision, findings)} for one model's findings."""
    decisions = {}
    for level in LEVELS:
        if findings is None:
            decisions[level] = ("uncertain", [])
        else:
            decisions[level] = decide(add_word_segments(findings, timings), level, threshold=threshold)
    return decisions


def case_output(saved, threshold=None):
    """{"quality", "seconds", "decisions"} for one recording, as app/evaluation.py reads it:
    the decision of each model at every level, at this threshold (None: CONFIDENCE_THRESHOLD)."""
    quality = saved["quality"]
    if quality in (UNREADABLE, "too_long"):
        # Not a quality result: the duration guard or unreadable audio (dataset doc, B.8)
        return {"quality": GUARD, "seconds": saved["seconds"], "decisions": {}}
    if quality != "ok":
        return {"quality": quality, "seconds": saved["seconds"], "decisions": {}}

    timings = get_word_timings(saved["surah"], saved["ayah"])
    decisions = {}
    for model, findings in model_findings(saved).items():
        decisions[model] = decisions_at_every_level(findings, timings, threshold)
    return {"quality": "ok", "seconds": saved["seconds"], "decisions": decisions}
