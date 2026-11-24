# whisper-quran adapter: skipped, different and extra words in one recorded ayah (taxonomy 1.4).
import difflib
import os
import re
from functools import cache
from typing import NamedTuple

import torch
from transformers import WhisperForConditionalGeneration, WhisperProcessor

from app.model_files import check_revision, local_copy
from app.policy import make_finding
from app.schemas import Finding

NAME = "whisper-quran"
HF_REPO = "tarteel-ai/whisper-base-ar-quran"
HF_REVISION = os.environ.get("WHISPER_QURAN_REVISION", "5c3c53fdf9272c4f6ee0bee09a1e5a4a615ee25c")
HF_FILES = ["*.json", "*.txt", "pytorch_model.bin"]
SAMPLE_RATE = 16000
MAX_NEW_TOKENS = 200


class Runaway(Exception):
    """The model kept writing until MAX_NEW_TOKENS without finishing: its text cannot be trusted."""


MARKS = re.compile("[ً-ٰٟۖ-ۭـ]")
SAME_LETTER = {
    "ٱ": "ا",
    "أ": "ا",
    "إ": "ا",
    "آ": "ا",
    "ى": "ي",
    "ؤ": "و",
    "ئ": "ي",
    "ة": "ه",
}


@cache
def load_model():
    """(processor, model) at the pinned revision, from services/ai/models/ or the Hugging Face cache."""
    check_revision(HF_REVISION, "WHISPER_QURAN_REVISION")
    folder = local_copy(HF_REPO, HF_REVISION)
    source, pin = (str(folder), {}) if folder else (HF_REPO, {"revision": HF_REVISION})
    processor = WhisperProcessor.from_pretrained(source, **pin)
    model = WhisperForConditionalGeneration.from_pretrained(source, **pin, use_safetensors=False)
    model = model.to("cuda").eval()
    if MAX_NEW_TOKENS + 4 > model.config.max_target_positions:
        raise ValueError("MAX_NEW_TOKENS does not fit the model's positions")
    return processor, model


def model_version():
    """Exact model revision (OPS-008)."""
    return f"{HF_REPO}@{HF_REVISION[:12]}"


def normalize(word: str) -> str:
    """The word without marks and with one form per letter, so two spellings can be compared."""
    for letter, same in SAME_LETTER.items():
        word = word.replace(letter, same)
    return MARKS.sub("", word)


def group_words(tokens: list[str], probabilities: list[float]) -> list[tuple[list[int], float]]:
    """(token positions, lowest probability) per word; a token starting with "Ġ" begins a new word."""
    words = []
    for position, (token, probability) in enumerate(zip(tokens, probabilities)):
        if token.startswith("Ġ") or not words:
            words.append(([], []))
        words[-1][0].append(position)
        words[-1][1].append(probability)
    return [(positions, round(min(values), 3)) for positions, values in words]


def transcribe(samples) -> tuple[list[str], list[float]]:
    """(words, confidences) the model heard; raises Runaway when it did not finish."""
    processor, model = load_model()
    tokenizer = processor.tokenizer
    features = processor(samples, sampling_rate=SAMPLE_RATE, return_tensors="pt").input_features.to("cuda")
    with torch.no_grad():
        output = model.generate(
            features, return_dict_in_generate=True, output_scores=True, max_new_tokens=MAX_NEW_TOKENS
        )
    if output.sequences[0][-1].item() != tokenizer.eos_token_id:
        raise Runaway()
    scores = model.compute_transition_scores(output.sequences, output.scores, normalize_logits=True)[0]

    generated = output.sequences[0][-len(scores):].tolist()
    special = set(tokenizer.all_special_ids)
    text_ids = [token for token in generated if token not in special]
    probabilities = [float(p) for token, p in zip(generated, torch.exp(scores)) if token not in special]

    words, confidences = [], []
    for positions, confidence in group_words(tokenizer.convert_ids_to_tokens(text_ids), probabilities):
        word = tokenizer.decode([text_ids[p] for p in positions]).strip()
        if word:
            words.append(word)
            confidences.append(confidence)
    return words, confidences


class WordError(NamedTuple):
    """One reference word (from 1) not read as written, and the said words (from 0) it rests on."""

    word: int
    code: str
    evidence: tuple[int, ...]


def compare_words(reference_words: list[str], said_words: list[str]) -> list[WordError]:
    """Skipped, different and extra words; an extra word points to the reference word before it."""
    expected = [normalize(w) for w in reference_words]
    said = [normalize(w) for w in said_words]

    def around(said_position):
        """The said words just before and just after a gap."""
        return tuple(p for p in (said_position - 1, said_position) if 0 <= p < len(said))

    errors = []
    matcher = difflib.SequenceMatcher(a=expected, b=said, autojunk=False)
    for operation, ref_start, ref_end, said_start, said_end in matcher.get_opcodes():
        if operation == "delete":
            for i in range(ref_start, ref_end):
                errors.append(WordError(i + 1, "ERR_MEM_OMISSION", around(said_start)))

        elif operation == "insert":
            said = tuple(range(said_start, said_end))
            errors.append(WordError(max(ref_start, 1), "ERR_MEM_INSERTION", said))

        elif operation == "replace":
            ref_count = ref_end - ref_start
            said_count = said_end - said_start
            different = min(ref_count, said_count)
            for k in range(different):
                errors.append(WordError(ref_start + k + 1, "ERR_MEM_SUBSTITUTION", (said_start + k,)))
            for i in range(ref_start + different, ref_end):
                errors.append(WordError(i + 1, "ERR_MEM_OMISSION", tuple(range(said_start, said_end))))
            if said_count > ref_count:
                extra = tuple(range(said_start + different, said_end))
                errors.append(WordError(ref_end, "ERR_MEM_INSERTION", extra))
    return errors


def finding_confidence(evidence: tuple[int, ...], confidences: list[float]) -> float:
    """The lowest confidence of the said words a finding rests on; 0 when there are none."""
    return min((confidences[p] for p in evidence), default=0.0)


def find_errors(samples, reference_words: list[str]) -> list[Finding]:
    """At most one finding per word (the first found), in word order; decides nothing; may raise Runaway."""
    said_words, confidences = transcribe(samples)

    findings_by_word = {}
    for error in compare_words(reference_words, said_words):
        if error.word not in findings_by_word:
            confidence = finding_confidence(error.evidence, confidences)
            findings_by_word[error.word] = make_finding(error.word, error.code, confidence, 0, 0)

    return [findings_by_word[word] for word in sorted(findings_by_word)]
