# The reference Quran text of the prototype ayat. Owner: Qussai.
# Source: packages/contracts/data/reference_quran_text.json (5 surahs, 25 ayat).
#
# The folder comes from REFERENCE_DATA_DIR. Without it, the repository folder is used, which works
# when the service runs from a checkout but not inside the Docker image (only app/ is copied there).
import json
import os
from pathlib import Path

TEXT_FILE_NAME = "reference_quran_text.json"

ayat = {}


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


def get_ayah(surah, ayah):
    """Returns {"text_uthmani": ..., "words": [{"position", "text"}, ...]}, or None if not a prototype ayah."""
    if not ayat:
        load_ayat()
    return ayat.get((surah, ayah))
