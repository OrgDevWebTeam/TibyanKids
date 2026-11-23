# The threshold sweep (scripts/sweep_threshold.py) and decide()'s threshold argument, on synthetic
# saved outputs and labels.
import importlib.util
from pathlib import Path

from app import saved_outputs
from app.policy import DEFAULT_THRESHOLD, decide, make_finding

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "sweep_threshold.py"
spec = importlib.util.spec_from_file_location("sweep_threshold", SCRIPT)
sweep_threshold = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sweep_threshold)

TARGETS = {"falseReject": 0.05, "falseAcceptMemorization": 0.15, "uncertain": 0.30}


def test_decide_uses_the_threshold_given():
    finding = make_finding(1, "ERR_MEM_OMISSION", 0.72, 0, 0)
    assert decide([finding], "beginner", threshold=0.70)[0] == "error"
    assert decide([finding], "beginner", threshold=0.75)[0] == "uncertain"


def test_decide_without_a_threshold_reads_the_setting(monkeypatch):
    finding = make_finding(1, "ERR_MEM_OMISSION", DEFAULT_THRESHOLD, 0, 0)
    assert decide([finding], "beginner")[0] == "error"
    monkeypatch.setenv("CONFIDENCE_THRESHOLD", "0.9")
    assert decide([finding], "beginner")[0] == "uncertain"


def test_thresholds_from_050_to_095():
    assert sweep_threshold.thresholds(0.5, 0.95, 0.05) == [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]


def test_meets_needs_all_three_targets():
    row = {"falseRejectRate": 0.04, "falseAcceptMemorization": 0.10, "uncertainRate": 0.30}
    assert sweep_threshold.meets(row, TARGETS) == "yes"
    assert sweep_threshold.meets({**row, "uncertainRate": 0.31}, TARGETS) == "no"
    assert sweep_threshold.meets({**row, "falseAcceptMemorization": None}, TARGETS) == "unknown"


def recording(rec):
    return {"recordingId": rec, "source": "child", "ageBand": "9-11", "audioQuality": "ok"}


def saved(rec, confidence):
    """Both models say word 2 of 112:1 was skipped, with this confidence."""
    skipped = make_finding(2, "ERR_MEM_OMISSION", confidence, 0, 0).model_dump()
    return {
        "recordingId": rec, "surah": 112, "ayah": 1, "quality": "ok", "error": None, "gate": {},
        "seconds": {}, "findings": {saved_outputs.MUAALEM: [skipped], saved_outputs.WHISPER: [skipped]},
        "modelProblems": {},
    }


def test_a_higher_threshold_turns_errors_into_uncertain():
    """Two recordings where the child really skipped word 2; the models are 72% and 88% sure."""
    data = {
        "recordings": [recording("REC_A"), recording("REC_B")],
        "gold": {"REC_A": {2: ["ERR_MEM_OMISSION"]}, "REC_B": {2: ["ERR_MEM_OMISSION"]}},
        "saved": {"REC_A": saved("REC_A", 0.72), "REC_B": saved("REC_B", 0.88)},
    }
    rows = sweep_threshold.sweep(data, [0.7, 0.8, 0.9], TARGETS)
    combined = {row["threshold"]: row for row in rows if row["model"] == "combined" and row["level"] == "beginner"}
    assert [combined[t]["uncertainRate"] for t in [0.7, 0.8, 0.9]] == [0.0, 0.5, 1.0]
    assert all(combined[t]["falseAcceptMemorization"] == 0.0 for t in combined)
    assert combined[0.7]["wordLocationAccuracy"] == 1.0
    assert combined[0.7]["falseRejectRate"] is None  # no correct readings to wrongly stop
    assert combined[0.7]["meetsTargets"] == "unknown"


def test_every_model_and_level_gets_a_row_per_threshold():
    data = {"recordings": [recording("REC_A")], "gold": {"REC_A": {}}, "saved": {"REC_A": saved("REC_A", 0.9)}}
    rows = sweep_threshold.sweep(data, [0.5, 0.6], TARGETS)
    assert len(rows) == len(saved_outputs.MODELS) * 3 * 2
    assert set(rows[0]) == set(sweep_threshold.COLUMNS)
