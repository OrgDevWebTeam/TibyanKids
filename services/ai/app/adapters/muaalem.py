# quran-muaalem adapter: one recording of one ayah -> contract result. Owner: Qussai.
# Mapping from the model's errors to our codes: docs/ai/tajweed_taxonomy_and_feedback.md, section 1.4.
# Licence: QML 1.0 (docs/ai/genai_and_safety_boundaries.en.md, section 3).
#
# Steps:
#   1. quran_phonetizer turns the expected ayah (Uthmani text) into reference phonemes.
#   2. The model listens to the recording and predicts the phonemes the child said.
#   3. explain_error compares the two and returns each error with its tajweed rule.
#   4. Each error becomes one finding: the word it is in, our code, and a confidence.
import os
import re
import time
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

from app.model_files import local_copy
from app.policy import decide, make_finding
from app.schemas import AnalysisResult

MODEL = "quran-muaalem"
MODEL_NAME = "obadx/muaalem-model-v3_2"
# Exact model revision (Hugging Face commit), so an update on the Hub never changes results silently.
# The week 2 run used this one. Change it only together with an evaluation run (AI release rules).
MODEL_REVISION = os.environ.get("MUAALEM_REVISION", "01a1ef9fbe40d144ef845101e89ff924aed3fef5")
# The files the model needs (download_models.py copies the same ones)
MODEL_FILES = ["*.json", "*.safetensors"]
SAMPLE_RATE = 16000

# Which category comes first when one word has several errors (taxonomy 1.1)
CATEGORY_ORDER = ["memorization", "pronunciation", "tajweed", "technical"]

model = None


def load_model():
    global model
    if model is None:
        if not re.fullmatch(r"[0-9a-f]{40}", MODEL_REVISION):
            raise ValueError("MUAALEM_REVISION must be a full 40-character commit hash")
        # services/ai/models/ when it holds the pinned revision (scripts/download_models.py). Otherwise
        # the pinned files from the Hugging Face cache: Muaalem() takes no revision, so they are
        # fetched first and loaded from disk.
        folder = local_copy(MODEL_NAME, MODEL_REVISION) or snapshot_download(
            MODEL_NAME, revision=MODEL_REVISION, allow_patterns=MODEL_FILES
        )
        model = Muaalem(model_name_or_path=folder, device="cuda")
    return model


def model_version():
    # Package version + exact model revision (OPS-008)
    return f"{version('quran-muaalem')} {MODEL_NAME}@{MODEL_REVISION[:12]}"


def moshaf_settings() -> MoshafAttributes:
    # Expected madd lengths (taxonomy item 5.3, still open). Set them in .env to change them.
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
    """
    For each place in the REFERENCE phonemes, the positions of the PREDICTED phonemes lined up with it.

    Why: explain_error() says where an error is in the reference phonemes (error.ph_pos), but the
    confidence lives on the predicted phonemes (the model's probability for each sound it heard). So
    we line the two up again, the same way explain_error() does, and keep the link.

    Both strings are cut into groups (a letter with its vowel, a long vowel, ...) and the groups are
    aligned. The key is (start of the group in the reference, kind): kind is "insert" for a group the
    child added, which has no reference sound of its own, and "other" for everything else.

    Real example, Al-Ikhlas 1 with the first letter said as ك instead of ق:
        reference groups  قُ | ل | هُ | ...     predicted groups  كُ | ل | هُ | ...
        explain_error() -> one error at ph_pos (0, 2), reference phonemes 0-1 ("قُ")
        result          -> {(0, "other"): [0, 1], (2, "other"): [2], (3, "other"): [3, 4], ...}
    so the error's confidence is the lowest probability of predicted phonemes 0 and 1 ("كُ").
    """
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
    """
    The lowest probability of the predicted phonemes of this error (see predicted_positions()).
    A deleted sound was not heard at all, so it has no probability: 0, which sends the ayah to the
    teacher (taxonomy 1.4, rule 2).
    """
    kind = "insert" if error.speech_error_type == "insert" else "other"
    values = [float(probs[i]) for i in positions.get((error.ph_pos[0], kind), [])]
    if not values:
        return 0.0
    return round(min(values), 3)


def error_code(error) -> str | None:
    """
    Our error code for one error found by muaalem, or None when it is not an error for us.
    The mapping table: docs/ai/tajweed_taxonomy_and_feedback.md, section 1.4.
    """
    if error.error_type == "normal":  # one letter said as another
        return "ERR_PRON_LETTER_SUB"
    if error.error_type == "tashkeel":  # a wrong short vowel (haraka)
        return "ERR_PRON_HARAKA"

    # Otherwise error_type == "tajweed": the code depends on the tajweed rule of that sound.
    if not error.ref_tajweed_rules:
        return "ERR_TAJ_UNMAPPED"  # no rule we know: never guess, the teacher checks it
    rule = error.ref_tajweed_rules[0]

    if isinstance(rule, Qalqalah):
        return "ERR_TAJ_QALQALA_OMIT"
    # Keep this BEFORE the madd check: in quran_transcript, MoshaddadOrModghamNoonRule (a ghunna rule)
    # is a subclass of MaddRule, so the madd check would catch it too.
    if isinstance(rule, (Ghonnah, MoshaddadOrModghamNoonRule)):
        return "ERR_TAJ_GHONNA_OMIT"
    if isinstance(rule, MaddRule):
        return madd_code(rule, error)
    return "ERR_TAJ_UNMAPPED"


def madd_code(rule, error) -> str | None:
    """The code for a madd (a vowel held longer) that was not held as expected."""
    counts = error.predicted_len or 0  # how many counts the child held it
    # A madd before a pause (aarid) is accepted from 2 counts: the tolerance for children (taxonomy 1.4)
    if isinstance(rule, AaredMaddRule) and counts >= 2:
        return None
    # Held too long: our taxonomy has no code for it, so the teacher checks it
    if error.predicted_len is not None and counts > (error.expected_len or 0):
        return "ERR_TAJ_UNMAPPED"
    return "ERR_TAJ_MADD_SHORT"


def analyze(samples, uthmani_text: str, level: str, attempt_id: str) -> AnalysisResult:
    """
    Checks one recording of one ayah for sound and tajweed errors.
    samples: 16 kHz mono float32 audio that passed the quality gate (the clip).
    uthmani_text: the ayah's text in Uthmani script, as in reference_quran_text.json.
    """
    started = time.perf_counter()
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

    # One finding per word: the error of the most important category (taxonomy 1.1); on a tie, the
    # first one found
    findings_by_word = {}
    for error in errors:
        code = error_code(error)
        if code is None:
            continue
        # No word timings yet, so the replay segment is 0-0 until the new timings are added
        finding = make_finding(
            word_index(uthmani_text, error.uthmani_pos[0]), code, confidence(error, positions, output.phonemes.probs), 0, 0
        )
        current = findings_by_word.get(finding.wordIndex)
        if current is None or CATEGORY_ORDER.index(finding.category) < CATEGORY_ORDER.index(current.category):
            findings_by_word[finding.wordIndex] = finding

    findings = [findings_by_word[word] for word in sorted(findings_by_word)]
    decision, findings = decide(findings, level)
    return AnalysisResult(
        attemptId=attempt_id,
        model=MODEL,
        modelVersion=model_version(),
        decision=decision,
        quality="ok",
        findings=findings,
        processingMs=int((time.perf_counter() - started) * 1000),
    )
