# The text and word timings of the 25 prototype ayat (packages/contracts/data or REFERENCE_DATA_DIR).
import json
import os
from pathlib import Path

TEXT_FILE_NAME = "reference_quran_text.json"
TIMINGS_FILE_NAME = "reference_word_timings.json"

ayat = {}
timings = {}


def data_dir():
    """REFERENCE_DATA_DIR, or the repository's packages/contracts/data when it is not set."""
    configured = os.environ.get("REFERENCE_DATA_DIR")
    if configured:
        return Path(configured)
    parents = Path(__file__).resolve().parents
    if len(parents) < 4:
        raise RuntimeError("Set REFERENCE_DATA_DIR to the folder that holds reference_quran_text.json")
    return parents[3] / "packages" / "contracts" / "data"


def load_ayat():
    """Reads the reference text into `ayat`."""
    with open(data_dir() / TEXT_FILE_NAME, encoding="utf-8") as f:
        surahs = json.load(f)
    for surah in surahs:
        for ayah in surah["ayahs"]:
            ayat[(surah["surah_id"], ayah["ayah_id"])] = ayah


def load_timings():
    """Reads the word timings into `timings`."""
    with open(data_dir() / TIMINGS_FILE_NAME, encoding="utf-8") as f:
        entries = json.load(f)
    for entry in entries:
        words = {word["position"]: (word["start_ms"], word["end_ms"]) for word in entry["words"]}
        timings[(entry["surah_id"], entry["ayah_id"])] = words


def get_ayah(surah, ayah):
    """{"text_uthmani", "words": [{"position", "text", "text_imlaei"}]}, or None if not a prototype ayah."""
    if not ayat:
        load_ayat()
    return ayat.get((surah, ayah))


def get_word_timings(surah, ayah):
    """{word position: (start_ms, end_ms)}; raises if the ayah has no timings (broken data)."""
    if not timings:
        load_timings()
    words = timings.get((surah, ayah))
    if words is None:
        raise ValueError(f"No word timings for {surah}:{ayah} in {TIMINGS_FILE_NAME}")
    return words


def add_word_segments(findings, word_timings):
    """The findings with wordStartMs and wordEndMs of their word; raises if a word has no timing."""
    with_segments = []
    for finding in findings:
        if finding.wordIndex not in word_timings:
            raise ValueError(f"No timing for word {finding.wordIndex} in {TIMINGS_FILE_NAME}")
        start_ms, end_ms = word_timings[finding.wordIndex]
        with_segments.append(finding.model_copy(update={"wordStartMs": start_ms, "wordEndMs": end_ms}))
    return with_segments
