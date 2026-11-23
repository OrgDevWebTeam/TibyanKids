# Saved model outputs (app/saved_outputs.py) and the run script (scripts/run_models.py), with fake
# models and fake audio: no GPU, no recording of anyone.
import importlib.util
import json
from pathlib import Path

import numpy as np
import pytest

from app import saved_outputs
from app.adapters import muaalem, whisper_quran
from app.audio import AudioError
from app.evaluation import GUARD, LEVELS
from app.policy import make_finding

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_models.py"
spec = importlib.util.spec_from_file_location("run_models", SCRIPT)
run_models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run_models)

REC = "REC_001_112_001"  # 112:1, four words


def finding(word, code, confidence=0.9):
    return make_finding(word, code, confidence, 0, 0).model_dump()


def saved(quality="ok", muaalem_findings=(), whisper_findings=()):
    """A saved output as run_models.py writes it."""
    return {
        "recordingId": REC, "surah": 112, "ayah": 1, "quality": quality, "error": None, "gate": {},
        "seconds": {"decode": 0.1, "gate": 0.2},
        "findings": {
            muaalem.NAME: None if muaalem_findings is None else list(muaalem_findings),
            whisper_quran.NAME: None if whisper_findings is None else list(whisper_findings),
        },
        "modelProblems": {},
    }


def test_a_saved_output_reads_back_the_same(tmp_path):
    output = saved(muaalem_findings=[finding(2, "ERR_PRON_HARAKA")])
    saved_outputs.write_output(tmp_path, output)
    assert saved_outputs.read_output(tmp_path, REC) == output
    assert saved_outputs.read_output(tmp_path, "REC_009_001_001") is None


def test_no_findings_is_accepted_by_every_model_at_every_level():
    decisions = saved_outputs.case_output(saved())["decisions"]
    assert set(decisions) == set(saved_outputs.MODELS)
    assert all(decisions[model][level][0] == "accepted" for model in decisions for level in LEVELS)


def test_the_decision_is_made_with_word_segments_when_read():
    skipped = [finding(2, "ERR_MEM_OMISSION")]
    output = saved(muaalem_findings=skipped, whisper_findings=skipped)
    decision, findings = saved_outputs.case_output(output)["decisions"][saved_outputs.COMBINED]["beginner"]
    assert decision == "error"
    assert findings[0].wordEndMs > findings[0].wordStartMs  # the reference segment of word 2


def test_a_model_without_an_answer_is_uncertain_alone_and_combined():
    """whisper ran away (or failed): uncertain, as in the service; muaalem alone still decides."""
    decisions = saved_outputs.case_output(saved(whisper_findings=None))["decisions"]
    assert decisions[whisper_quran.NAME]["beginner"] == ("uncertain", [])
    assert decisions[saved_outputs.COMBINED]["beginner"] == ("uncertain", [])
    assert decisions[muaalem.NAME]["beginner"][0] == "accepted"


def test_the_two_models_are_combined_when_read():
    """whisper says a word was skipped but muaalem heard it: the models disagree, so uncertain."""
    output = saved(whisper_findings=[finding(3, "ERR_MEM_OMISSION")])
    decision, findings = saved_outputs.case_output(output)["decisions"][saved_outputs.COMBINED]["beginner"]
    assert decision == "uncertain"
    assert findings[0].code == "ERR_TECH_MODELS_DISAGREE"


@pytest.mark.parametrize("quality, expected", [("silent", "silent"), ("too_noisy", "too_noisy"),
                                               ("too_long", GUARD), (saved_outputs.UNREADABLE, GUARD)])
def test_a_rejected_recording_has_no_decisions(quality, expected):
    output = saved_outputs.case_output(saved(quality=quality))
    assert output["quality"] == expected and output["decisions"] == {}


# scripts/run_models.py with fake audio, a fake VAD and fake models


@pytest.fixture
def fake_audio(monkeypatch, tmp_path):
    """For any file: a quiet second, a two-second tone the fake VAD hears as speech, a quiet second."""
    tone = (0.1 * np.sin(2 * np.pi * 220 * np.arange(32000) / 16000)).astype(np.float32)
    samples = np.concatenate([np.zeros(16000), tone, np.zeros(16000)]).astype(np.float32)
    samples += np.random.default_rng(0).normal(0, 0.001, len(samples)).astype(np.float32)
    monkeypatch.setattr(run_models, "decode_audio", lambda _bytes: samples)
    monkeypatch.setattr(run_models, "speech_parts", lambda _samples: [(16000, 48000)])
    path = tmp_path / f"{REC}.wav"
    path.write_bytes(b"RIFF fake")
    return path


class FakeModel:
    """Stands in for a model: find_errors returns these findings, or raises this error."""

    def __init__(self, findings=(), error=None):
        self.findings = findings
        self.error = error

    def find_errors(self, _clip, _reference):
        if self.error is not None:
            raise self.error
        return [make_finding(**finding) for finding in self.findings]


def fake_models(muaalem_model=None, whisper_model=None):
    """{name: find_errors} for analyse(); a model not given finds nothing."""
    muaalem_model = muaalem_model or FakeModel()
    whisper_model = whisper_model or FakeModel()
    return {muaalem.NAME: muaalem_model.find_errors, whisper_quran.NAME: whisper_model.find_errors}


def test_analyse_saves_the_gate_numbers_findings_and_times(fake_audio):
    word = {"word_index": 2, "code": "ERR_PRON_HARAKA", "confidence": 0.8}
    word.update({"word_start_ms": 0, "word_end_ms": 0})
    output = run_models.analyse(fake_audio, REC, fake_models(muaalem_model=FakeModel(findings=[word])))
    assert output["quality"] == "ok"
    assert output["gate"]["speechSeconds"] == 2.0
    assert output["findings"][muaalem.NAME][0]["code"] == "ERR_PRON_HARAKA"
    assert output["findings"][whisper_quran.NAME] == []
    assert set(output["seconds"]) == set(saved_outputs.TIMED_STEPS)
    json.dumps(output)  # can be saved as it is


def test_analyse_keeps_a_runaway_as_no_answer(fake_audio):
    runaway = FakeModel(error=whisper_quran.Runaway())
    output = run_models.analyse(fake_audio, REC, fake_models(whisper_model=runaway))
    assert output["findings"][whisper_quran.NAME] is None
    assert output["modelProblems"] == {whisper_quran.NAME: "runaway"}


def test_analyse_keeps_going_when_a_model_fails(fake_audio):
    broken = FakeModel(error=RuntimeError("CUDA out of memory"))
    output = run_models.analyse(fake_audio, REC, fake_models(muaalem_model=broken))
    assert output["findings"][muaalem.NAME] is None
    assert output["modelProblems"] == {muaalem.NAME: "RuntimeError"}


def test_analyse_does_not_run_the_models_on_a_rejected_recording(fake_audio, monkeypatch):
    monkeypatch.setattr(run_models, "speech_parts", lambda _samples: [])
    never_called = FakeModel(error=AssertionError("must not run"))
    output = run_models.analyse(fake_audio, REC, fake_models(muaalem_model=never_called))
    assert output["quality"] == "silent"
    assert output["findings"] == {}
    assert output["gate"]["speechSeconds"] == 0.0


def test_analyse_marks_unreadable_audio(fake_audio, monkeypatch):
    def broken(_bytes):
        raise AudioError("DECODE_FAILED", "not audio")
    monkeypatch.setattr(run_models, "decode_audio", broken)
    output = run_models.analyse(fake_audio, REC, fake_models())
    assert output["quality"] == saved_outputs.UNREADABLE and output["error"] == "DECODE_FAILED"


def test_a_run_folder_refuses_other_model_versions(tmp_path):
    run_models.start_run(tmp_path / "run", {"m": "1"})
    run_models.start_run(tmp_path / "run", {"m": "1"})  # continuing the same run is fine
    with pytest.raises(SystemExit):
        run_models.start_run(tmp_path / "run", {"m": "2"})


# scripts/evaluate.py end to end: a tiny fake dataset, saved outputs, then the command itself


def test_evaluate_reads_saved_outputs_and_refuses_test_before_the_freeze(tmp_path):
    import subprocess
    import sys

    prepare_script = SCRIPT.parent / "prepare_dataset.py"
    prepare_spec = importlib.util.spec_from_file_location("prepare_dataset", prepare_script)
    prepare = importlib.util.module_from_spec(prepare_spec)
    prepare_spec.loader.exec_module(prepare)

    source = tmp_path / "source"
    for speaker in ["SPK_001", "SPK_002"]:
        (source / speaker).mkdir(parents=True)
        (source / speaker / "112_001.wav").write_bytes(b"RIFF fake")
    eval_folder = tmp_path / "tibyan-eval"
    prepare.layout(source, eval_folder)
    rows = [{"speakerId": s, "ageBand": "9-11", "consentId": f"CON_{s[4:]}"} for s in ["SPK_001", "SPK_002"]]
    prepare.write_csv(eval_folder / "speakers.csv", prepare.SPEAKER_COLUMNS, rows)
    prepare.split(eval_folder, test_count=1, dev_count=1)

    sheet = prepare.read_csv(eval_folder / "labelling_sheet.csv")
    for row in sheet:
        row["teacherDecision"] = "correct"
    prepare.write_csv(tmp_path / "teacher.csv", prepare.SHEET_COLUMNS, sheet)
    prepare.import_labels(eval_folder, tmp_path / "teacher.csv")

    run_folder = eval_folder / "outputs" / "2026-11-23"
    run_models.start_run(run_folder, {"quran-muaalem": "v", "whisper-quran": "v"})
    for rec in prepare.recording_ids(eval_folder):
        output = saved()
        output["recordingId"] = rec
        saved_outputs.write_output(run_folder, output)

    def evaluate(split):
        command = [sys.executable, str(SCRIPT.parent / "evaluate.py"), str(eval_folder), "--split", split]
        return subprocess.run(command, capture_output=True, text=True, encoding="utf-8")

    dev = evaluate("dev")
    assert dev.returncode == 0, dev.stderr
    assert "Saved outputs: 2026-11-23" in dev.stdout
    run = json.loads(next((eval_folder / "runs").glob("*-dev.json")).read_text(encoding="utf-8"))
    assert run["outputs"] == "2026-11-23" and run["datasetFrozen"] is False
    assert run["results"]["child"]["analysed"] == 1

    assert evaluate("test").returncode != 0  # not frozen yet
    prepare.freeze(eval_folder)
    assert evaluate("test").returncode == 0
