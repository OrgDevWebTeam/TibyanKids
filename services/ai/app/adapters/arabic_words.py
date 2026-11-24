# The Arabic words stage model (FR-ARB-002, ADR-0010): Whisper large-v3, pinned, on the GPU.
import os
from functools import cache

import torch
from faster_whisper import WhisperModel

from app.model_files import check_revision, local_copy

NAME = "whisper-large-v3"
HF_REPO = "Systran/faster-whisper-large-v3"
HF_REVISION = os.environ.get("ARABIC_WORDS_REVISION", "edaa852ec7e145841d8ffdb056a99866b5f0a478")
HF_FILES = ["config.json", "model.bin", "preprocessor_config.json", "tokenizer.json", "vocabulary.json"]


def model_folder():
    """The pinned copy in services/ai/models/ (no Hugging Face cache fallback)."""
    check_revision(HF_REVISION, "ARABIC_WORDS_REVISION")
    folder = local_copy(HF_REPO, HF_REVISION)
    if folder is None:
        raise FileNotFoundError(f"{HF_REPO} is not in services/ai/models/: run scripts/download_models.py")
    return folder


@cache
def load_model():
    """The model in float16 on the GPU, loaded once."""
    if not torch.cuda.is_available():
        raise RuntimeError("No CUDA GPU: the Arabic words model runs on the GPU machine")
    return WhisperModel(str(model_folder()), device="cuda", compute_type="float16")


def model_version():
    """Exact model revision (OPS-008)."""
    return f"{HF_REPO}@{HF_REVISION[:12]}"
