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
from pathlib import Path

from app.combine import combine_findings
from app.evaluation import GUARD, LEVELS
from app.policy import decide
from app.reference import add_word_segments, get_word_timings
from app.schemas import Finding

MUAALEM = "quran-muaalem"  # app.adapters.muaalem.NAME
WHISPER = "whisper-quran"  # app.adapters.whisper_quran.NAME
COMBINED = "combined"
MODELS = [MUAALEM, WHISPER, COMBINED]
TIMED_STEPS = ["decode", "gate", MUAALEM, WHISPER]

UNREADABLE = "unreadable"  # the audio could not be decoded (EMPTY_AUDIO, DECODE_FAILED, DECODE_TIMEOUT)
RUN_FILE = "run.json"  # the model versions and date of a run folder


def write_output(run_folder, saved):
    """Saves one recording's output as <recordingId>.json."""
    path = Path(run_folder) / f"{saved['recordingId']}.json"
    path.write_text(json.dumps(saved, ensure_ascii=False, indent=1), encoding="utf-8")


def read_output(run_folder, recording_id):
    """One recording's saved output, or None when it was not run yet."""
    path = Path(run_folder) / f"{recording_id}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def read_run(run_folder):
    """The run.json of a run folder: date and model versions."""
    return json.loads((Path(run_folder) / RUN_FILE).read_text(encoding="utf-8"))


def model_findings(saved):
    """{model: [Finding] or None} for each model alone and both combined.
    None means no usable answer (whisper ran away, or a model failed): the ayah is uncertain."""
    findings = {}
    for model in [MUAALEM, WHISPER]:
        raw = saved["findings"].get(model)
        findings[model] = None if raw is None else [Finding(**finding) for finding in raw]
    if findings[MUAALEM] is None or findings[WHISPER] is None:
        findings[COMBINED] = None
    else:
        findings[COMBINED] = combine_findings(findings[MUAALEM], findings[WHISPER])
    return findings


def case_output(saved):
    """{"quality", "seconds", "decisions"} for one recording, as app/evaluation.py reads it:
    the decision of each model at every level, with the threshold in CONFIDENCE_THRESHOLD."""
    quality = saved["quality"]
    if quality in (UNREADABLE, "too_long"):
        # Not a quality result: the duration guard or unreadable audio (dataset doc, B.8)
        return {"quality": GUARD, "seconds": saved["seconds"], "decisions": {}}
    if quality != "ok":
        return {"quality": quality, "seconds": saved["seconds"], "decisions": {}}

    timings = get_word_timings(saved["surah"], saved["ayah"])
    decisions = {}
    for model, findings in model_findings(saved).items():
        decisions[model] = {}
        for level in LEVELS:
            if findings is None:
                decisions[model][level] = ("uncertain", [])
            else:
                decisions[model][level] = decide(add_word_segments(findings, timings), level)
    return {"quality": "ok", "seconds": saved["seconds"], "decisions": decisions}
