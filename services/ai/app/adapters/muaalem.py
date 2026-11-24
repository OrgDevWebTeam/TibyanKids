# quran-muaalem adapter: sound and tajweed errors in one recorded ayah (taxonomy section 1.4).
import os
from functools import cache
from importlib.metadata import version

from huggingface_hub import snapshot_download
from quran_muaalem import Muaalem
from quran_transcript import MoshafAttributes, chunck_phonemes, explain_error, quran_phonetizer
from quran_transcript.phonetics.error_explainer import align_phonemes_groups
from quran_transcript.phonetics.tajweed_rulses import (
    AaredMaddRule,
    Ghonnah,
    MaddRule,
    MoshaddadOrModghamNoonRule,
    Qalqalah,
)

from app.model_files import check_revision, local_copy
from app.policy import CATEGORY_ORDER, make_finding
from app.schemas import Finding

NAME = "quran-muaalem"
HF_REPO = "obadx/muaalem-model-v3_2"
HF_REVISION = os.environ.get("MUAALEM_REVISION", "01a1ef9fbe40d144ef845101e89ff924aed3fef5")
HF_FILES = ["*.json", "*.safetensors"]
SAMPLE_RATE = 16000


@cache
def load_model():
    """The model at the pinned revision, from services/ai/models/ or the Hugging Face cache."""
    check_revision(HF_REVISION, "MUAALEM_REVISION")
    folder = local_copy(HF_REPO, HF_REVISION) or snapshot_download(
        HF_REPO, revision=HF_REVISION, allow_patterns=HF_FILES
    )
    return Muaalem(model_name_or_path=folder, device="cuda")


def model_version():
    """Package version and exact model revision (OPS-008)."""
    return f"{version('quran-muaalem')} {HF_REPO}@{HF_REVISION[:12]}"


def moshaf_settings() -> MoshafAttributes:
    """Hafs with the expected madd lengths, which can be changed in .env (taxonomy 5.3)."""
    return MoshafAttributes(
        rewaya="hafs",
        madd_monfasel_len=int(os.environ.get("MADD_MONFASEL_LEN", "2")),
        madd_mottasel_len=int(os.environ.get("MADD_MOTTASEL_LEN", "4")),
        madd_mottasel_waqf=int(os.environ.get("MADD_MOTTASEL_WAQF", "4")),
        madd_aared_len=int(os.environ.get("MADD_AARED_LEN", "2")),
    )


def word_index(uthmani_text: str, char_position: int) -> int:
    """The number (from 1) of the word that holds this character of the ayah text."""
    return uthmani_text[:char_position].count(" ") + 1


def predicted_positions(ref_phonemes: str, predicted_phonemes: str) -> dict:
    """For each reference phoneme group, (start, "insert" or "other") -> the predicted phonemes."""
    ref_groups = chunck_phonemes(ref_phonemes)
    predicted_groups = chunck_phonemes(predicted_phonemes)
    positions = {}
    ref_start = 0
    predicted_start = 0
    for align in align_phonemes_groups(ref_groups, predicted_groups):
        ref_length = 0 if align.op_type == "insert" else len(ref_groups[align.ref_idx])
        predicted_length = 0 if align.op_type == "delete" else len(predicted_groups[align.pred_idx])
        kind = "insert" if align.op_type == "insert" else "other"
        key = (ref_start, kind)
        positions.setdefault(key, [])
        positions[key].extend(range(predicted_start, predicted_start + predicted_length))
        ref_start += ref_length
        predicted_start += predicted_length
    return positions


def confidence(error, positions: dict, probs) -> float:
    """The lowest probability of the error's predicted phonemes; 0 for a sound that was not heard."""
    kind = "insert" if error.speech_error_type == "insert" else "other"
    values = [float(probs[i]) for i in positions.get((error.ph_pos[0], kind), [])]
    if not values:
        return 0.0
    return round(min(values), 3)


def error_code(error) -> str | None:
    """Our code for one muaalem error, or None when it is not an error for us."""
    if error.error_type == "normal":
        return "ERR_PRON_LETTER_SUB"
    if error.error_type == "tashkeel":
        return "ERR_PRON_HARAKA"

    if not error.ref_tajweed_rules:
        return "ERR_TAJ_UNMAPPED"
    rule = error.ref_tajweed_rules[0]

    if isinstance(rule, Qalqalah):
        return "ERR_TAJ_QALQALA_OMIT"
    if isinstance(rule, (Ghonnah, MoshaddadOrModghamNoonRule)):
        return "ERR_TAJ_GHONNA_OMIT"
    if isinstance(rule, MaddRule):
        return madd_code(rule, error)
    return "ERR_TAJ_UNMAPPED"


def madd_code(rule, error) -> str | None:
    """The code for a madd that was not held as expected (an aarid madd is fine from 2 counts)."""
    counts = error.predicted_len or 0
    if isinstance(rule, AaredMaddRule) and counts >= 2:
        return None
    if error.predicted_len is not None and counts > (error.expected_len or 0):
        return "ERR_TAJ_UNMAPPED"
    return "ERR_TAJ_MADD_SHORT"


def find_errors(samples, uthmani_text: str) -> list[Finding]:
    """At most one finding per word (the most important category), in word order; decides nothing."""
    reference = quran_phonetizer(uthmani_text, moshaf_settings(), remove_spaces=True)
    output = load_model()([samples], [reference], sampling_rate=SAMPLE_RATE)[0]
    predicted = output.phonemes.text

    errors = explain_error(
        uthmani_text=uthmani_text,
        ref_ph_text=reference.phonemes,
        predicted_ph_text=predicted,
        mappings=reference.mappings,
    )
    positions = predicted_positions(reference.phonemes, predicted)

    findings_by_word = {}
    for error in errors:
        code = error_code(error)
        if code is None:
            continue
        word = word_index(uthmani_text, error.uthmani_pos[0])
        finding = make_finding(word, code, confidence(error, positions, output.phonemes.probs), 0, 0)
        current = findings_by_word.get(word)
        if current is None or CATEGORY_ORDER.index(finding.category) < CATEGORY_ORDER.index(current.category):
            findings_by_word[word] = finding

    return [findings_by_word[word] for word in sorted(findings_by_word)]
