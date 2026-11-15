# whisper-quran adapter: one recording of one ayah -> contract result. Owner: Qussai.
# Licence: Apache-2.0.
#
# Steps:
#   1. The model writes down the words it hears (Arabic text with diacritics), each with its own
#      confidence: the lowest probability of the word's tokens.
#   2. The model writes ordinary (Imlaei) spelling, so it is compared with the Imlaei form of each
#      reference word (text_imlaei in reference_quran_text.json), not the Uthmani one. Both are
#      normalised first (no diacritics, one form per letter).
#   3. The two word lists are compared. A skipped word, a different word or an extra word becomes a
#      memorization finding (taxonomy 1.4: ERR_MEM_* come from this comparison), with the confidence
#      of the said words it rests on.
# The transcript itself never leaves this file (contract rule: model text is never shown to a child).
import difflib
import re
import time

from app.policy import decide, make_finding
from app.schemas import AnalysisResult

MODEL = "whisper-quran"
MODEL_NAME = "tarteel-ai/whisper-base-ar-quran"
SAMPLE_RATE = 16000
# Most tokens the model may write for one ayah. The longest prototype ayah (1:7) takes 75. The model
# allows 1024 in its generation settings but has only 448 positions: past that, generation crashes
# the GPU (CUDA device-side assert) and every later request fails until the service restarts. Noisy
# audio can make the model repeat itself until it gets there (108:3 with heavy noise did).
MAX_NEW_TOKENS = 200


class Runaway(Exception):
    """The model kept writing until MAX_NEW_TOKENS without finishing: its text cannot be trusted."""

# Harakat, dagger alif, Quranic marks (including small waw and small yaa) and tatweel.
# The Imlaei text keeps a dagger alif only where ordinary spelling has no alif (الرَّحْمَٰنِ, إِلَٰهِ;
# but الْعَالَمِينَ), so it is dropped, never turned into a full alif.
MARKS = re.compile("[ً-ٰٟۖ-ۭـ]")
# Letters written in more than one way
SAME_LETTER = {
    "ٱ": "ا",  # alif wasla -> alif
    "أ": "ا",  # alif with hamza above -> alif
    "إ": "ا",  # alif with hamza below -> alif
    "آ": "ا",  # alif madda -> alif
    "ى": "ي",  # alif maqsura -> yaa
    "ؤ": "و",  # waw with hamza -> waw
    "ئ": "ي",  # yaa with hamza -> yaa
    "ة": "ه",  # taa marbuta -> haa
}

processor = None
model = None


def load_model():
    global processor, model
    if model is None:
        # Imported here so the word comparison can be tested without torch (CI has no GPU packages)
        from transformers import WhisperForConditionalGeneration, WhisperProcessor

        processor = WhisperProcessor.from_pretrained(MODEL_NAME)
        model = WhisperForConditionalGeneration.from_pretrained(MODEL_NAME).to("cuda").eval()
        # The prompt (start, language, task, no-timestamps) takes 4 positions before the text
        if MAX_NEW_TOKENS + 4 > model.config.max_target_positions:
            raise ValueError("MAX_NEW_TOKENS does not fit the model's positions")
    return processor, model


def model_version():
    # Exact model revision (OPS-008)
    commit = load_model()[1].config._commit_hash or "unknown"
    return f"{MODEL_NAME}@{commit[:12]}"


def normalize(word):
    for letter, same in SAME_LETTER.items():
        word = word.replace(letter, same)
    return MARKS.sub("", word)


def group_words(tokens, probabilities):
    """
    Groups the model's text tokens into words. Returns a list of (token positions, confidence).

    tokens are the raw byte-level tokens: one that starts with "Ġ" (a space) begins a new word. A token
    can hold part of an Arabic letter, so words are never cut out of decoded token text.
    The confidence of a word is the lowest probability of its tokens (same rule as the muaalem adapter).
    """
    words = []
    for position, (token, probability) in enumerate(zip(tokens, probabilities)):
        if token.startswith("Ġ") or not words:
            words.append(([], []))
        words[-1][0].append(position)
        words[-1][1].append(probability)
    return [(positions, round(min(values), 3)) for positions, values in words]


def transcribe(samples):
    """
    Returns (words, confidences): the words the model heard and, for each word, its confidence.
    Raises Runaway when the model did not finish within MAX_NEW_TOKENS.
    """
    import torch

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

    # One score per generated token. The language, task and end tokens are left out: they are forced
    # or always certain, and would make every word look surer than it is.
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


def compare_words(reference_words, said_words):
    """
    Returns a list of (wordIndex, code, evidence). wordIndex counts the reference words from 1.
    An extra word points to the reference word just before it (contract rule for ERR_MEM_INSERTION).
    evidence holds the positions (from 0) of the said words the finding rests on, for its confidence:
    the word said instead, the extra word, or for a skipped word the said words around the gap.
    """
    expected = [normalize(w) for w in reference_words]
    said = [normalize(w) for w in said_words]

    def around(said_position):
        # The said words just before and just after a gap
        return tuple(p for p in (said_position - 1, said_position) if 0 <= p < len(said))

    errors = []
    matcher = difflib.SequenceMatcher(a=expected, b=said, autojunk=False)
    # ref_start and ref_end count from 0, so reference word i is word number i + 1
    for operation, ref_start, ref_end, said_start, said_end in matcher.get_opcodes():
        if operation == "delete":
            # Reference words that were not said
            for i in range(ref_start, ref_end):
                errors.append((i + 1, "ERR_MEM_OMISSION", around(said_start)))

        elif operation == "insert":
            # Extra words before reference word ref_start, so the word before them is number ref_start
            errors.append((max(ref_start, 1), "ERR_MEM_INSERTION", tuple(range(said_start, said_end))))

        elif operation == "replace":
            ref_count = ref_end - ref_start
            said_count = said_end - said_start
            different = min(ref_count, said_count)
            # Words read as other words
            for k in range(different):
                errors.append((ref_start + k + 1, "ERR_MEM_SUBSTITUTION", (said_start + k,)))
            # More reference words than said words: the rest were skipped
            for i in range(ref_start + different, ref_end):
                errors.append((i + 1, "ERR_MEM_OMISSION", tuple(range(said_start, said_end))))
            # More said words than reference words: extra words after the last word of this part
            if said_count > ref_count:
                extra = tuple(range(said_start + different, said_end))
                errors.append((ref_end, "ERR_MEM_INSERTION", extra))
    return errors


def finding_confidence(evidence, confidences):
    # Nothing heard to rest on (for example nothing said at all): 0, so the teacher checks it
    return min((confidences[p] for p in evidence), default=0.0)


def analyze(samples, reference_words, level, attempt_id):
    """samples: 16 kHz mono float32 audio that passed the quality gate. reference_words: the ayah's words in Imlaei spelling (text_imlaei)."""
    started = time.perf_counter()
    try:
        said_words, confidences = transcribe(samples)
    except Runaway:
        # The text is a loop, not what the child said: the teacher checks the ayah (FR-QUR-006)
        decision, findings = "uncertain", []
    else:
        # One finding per word: the first one found
        findings_by_word = {}
        for word, code, evidence in compare_words(reference_words, said_words):
            if word not in findings_by_word:
                confidence = finding_confidence(evidence, confidences)
                # No word timings yet, so the replay segment is 0-0 until the new timings are added
                findings_by_word[word] = make_finding(word, code, confidence, 0, 0)

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
