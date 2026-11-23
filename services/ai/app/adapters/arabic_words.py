# The Arabic words stage model (FR-ARB-002, ADR-0010): Whisper large-v3 through faster-whisper.
# This file pins and loads the model, like the recitation adapters. The word check itself
# (POST /v1/arabic/word) comes in week 5.
import os
from functools import cache

from app import cuda12
from app.model_files import check_revision, local_copy

NAME = "whisper-large-v3"
HF_REPO = "Systran/faster-whisper-large-v3"
# Change the pin only together with a new measurement (ADR-0010)
HF_REVISION = os.environ.get("ARABIC_WORDS_REVISION", "edaa852ec7e145841d8ffdb056a99866b5f0a478")
HF_FILES = ["config.json", "model.bin", "preprocessor_config.json", "tokenizer.json", "vocabulary.json"]


def model_folder():
    """The pinned copy in services/ai/models/. Unlike the recitation models there is no Hugging Face
    cache fallback: that cache needs symbolic links, which Windows refuses without Developer Mode."""
    check_revision(HF_REVISION, "ARABIC_WORDS_REVISION")
    folder = local_copy(HF_REPO, HF_REVISION)
    if folder is None:
        raise FileNotFoundError(f"{HF_REPO} is not in services/ai/models/: run scripts/download_models.py")
    return folder


@cache
def load_model():
    """The model in float16 on the GPU, loaded once."""
    # Imported here, not at the top: only the words stage needs faster-whisper, so the other
    # adapters and download_models.py work without it
    from faster_whisper import WhisperModel

    if not cuda12.make_findable():
        raise RuntimeError("The CUDA 12 libraries are missing: pip install -r requirements-gpu.txt")
    return WhisperModel(str(model_folder()), device="cuda", compute_type="float16")


def model_version():
    """Exact model revision (OPS-008)."""
    return f"{HF_REPO}@{HF_REVISION[:12]}"
