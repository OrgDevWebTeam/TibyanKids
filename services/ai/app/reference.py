# The reference data of the prototype ayat. Owner: Qussai.
# Sources (5 surahs, 25 ayat):
#   packages/contracts/data/reference_quran_text.json    the text of each ayah and its words
#   packages/contracts/data/reference_word_timings.json  where each word is in the reference audio
#
# The folder comes from REFERENCE_DATA_DIR. Without it, the repository folder is used, which works
# when the service runs from a checkout but not inside the Docker image (only app/ is copied there).
import json
import os
from pathlib import Path

TEXT_FILE_NAME = "reference_quran_text.json"
TIMINGS_FILE_NAME = "reference_word_timings.json"

# Loaded once, on first use
ayat = {}
timings = {}


def data_dir():
    configured = os.environ.get("REFERENCE_DATA_DIR")
    if configured:
        return Path(configured)
    # services/ai/app/reference.py -> repository root -> packages/contracts/data
    parents = Path(__file__).resolve().parents
    if len(parents) < 4:
        raise RuntimeError("Set REFERENCE_DATA_DIR to the folder that holds reference_quran_text.json")
    return parents[3] / "packages" / "contracts" / "data"


def load_ayat():
    with open(data_dir() / TEXT_FILE_NAME, encoding="utf-8") as f:
        surahs = json.load(f)
    for surah in surahs:
        for ayah in surah["ayahs"]:
            ayat[(surah["surah_id"], ayah["ayah_id"])] = ayah


def load_timings():
    with open(data_dir() / TIMINGS_FILE_NAME, encoding="utf-8") as f:
        entries = json.load(f)
    for entry in entries:
        words = {word["position"]: (word["start_ms"], word["end_ms"]) for word in entry["words"]}
        timings[(entry["surah_id"], entry["ayah_id"])] = words


def get_ayah(surah, ayah):
    """
    Returns {"text_uthmani": ..., "words": [{"position", "text", "text_imlaei"}, ...]}, or None if not a
    prototype ayah. "text" is the Uthmani word, "text_imlaei" the same word in ordinary spelling.
    """
    if not ayat:
        load_ayat()
    return ayat.get((surah, ayah))


def get_word_timings(surah, ayah):
    """
    Returns {word position: (start_ms, end_ms)} in the reference recitation of this ayah.
    Only called for a prototype ayah (get_ayah() is checked first), so a missing ayah means the
    reference data is broken: it raises instead of returning nothing.
    """
    if not timings:
        load_timings()
    words = timings.get((surah, ayah))
    if words is None:
        raise ValueError(f"No word timings for {surah}:{ayah} in {TIMINGS_FILE_NAME}")
    return words


def add_word_segments(findings, word_timings):
    """
    Returns the findings with wordStartMs and wordEndMs set from the reference recitation, so the app
    can replay only that word (FR-QUR-005). Called once, on the final findings of an ayah.
    word_timings: the result of get_word_timings() for the same ayah.
    A finding on a word without a timing raises: the replay would otherwise play nothing, silently.
    """
    with_segments = []
    for finding in findings:
        if finding.wordIndex not in word_timings:
            raise ValueError(f"No timing for word {finding.wordIndex} in {TIMINGS_FILE_NAME}")
        start_ms, end_ms = word_timings[finding.wordIndex]
        with_segments.append(finding.model_copy(update={"wordStartMs": start_ms, "wordEndMs": end_ms}))
    return with_segments
