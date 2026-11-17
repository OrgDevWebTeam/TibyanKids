# The AI service (internal HTTP only, never called by browsers). Owner: Qussai.
# Run: uvicorn app.main:app --port 8000
# Contract: docs/contracts/ai-result.md
#
# MOCK_MODE=true (the default, laptops and CI): fake but rule-following results (app/mock.py).
# MOCK_MODE=false (the GPU machine): the real models (app/pipeline.py), loaded when the service starts.
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.mock import MOCK_MODEL, MOCK_VERSION, mock_recitation
from app.reference import get_ayah
from app.schemas import AnalysisResult, Level

MAX_AUDIO_BYTES = 5 * 1024 * 1024  # 5 MB, same limit as the API (VAL-016)

# The pipeline's one JSON line per request goes to the console, next to uvicorn's own logs
logging.basicConfig(level=logging.INFO, format="%(message)s")


def is_mock_mode():
    # Read every time, so tests can switch it
    return os.environ.get("MOCK_MODE", "true").lower() == "true"


# app.pipeline is imported only with the real models: it needs numpy, which the mock Docker image
# (requirements.txt) does not install.


@asynccontextmanager
async def lifespan(app):
    if not is_mock_mode():
        from app import pipeline

        pipeline.load_models()
    yield


app = FastAPI(title="Noor AI service", lifespan=lifespan)


def error_response(status, code, message):
    # Same error shape as the API
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc):
    first = exc.errors()[0]
    field = ".".join(str(part) for part in first["loc"][1:]) or "body"
    return error_response(400, "VALIDATION_ERROR", f"{field}: {first['msg']}")


@app.exception_handler(Exception)
async def unexpected_error_handler(request, exc):
    # Any other bug (for example broken reference data): same error shape, so the API's fallback
    # saves "uncertain" and the teacher sees it. The traceback still goes to the service log.
    return error_response(500, "INTERNAL_ERROR", "Unexpected error in the AI service")


@app.get("/health")
def health():
    if is_mock_mode():
        models = [{"name": MOCK_MODEL, "version": MOCK_VERSION}]
    else:
        from app import pipeline

        models = pipeline.model_versions()
    return {"status": "ok", "mockMode": is_mock_mode(), "models": models}


# A normal (not async) route: FastAPI runs it in a thread, so a request waiting for the GPU
# (pipeline.MODELS_LOCK) does not stop /health from answering.
@app.post("/v1/recitation/analyze", response_model=AnalysisResult)
def analyze_recitation(
    audio: UploadFile = File(...),
    attemptId: str = Form(...),
    surah: int = Form(..., ge=1, le=114),
    ayah: int = Form(..., ge=1),
    level: Level = Form(...),
):
    started = time.perf_counter()

    # Before reading the audio: only the prototype ayat have a reference text and word timings
    if get_ayah(surah, ayah) is None:
        return error_response(400, "AYAH_NOT_SUPPORTED", f"{surah}:{ayah} is not a prototype ayah")

    # Read at most one byte over the limit, so an oversized upload is never loaded fully into memory
    audio_bytes = audio.file.read(MAX_AUDIO_BYTES + 1)
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return error_response(400, "FILE_TOO_LARGE", "The file is too large")

    if is_mock_mode():
        processing_ms = int((time.perf_counter() - started) * 1000)
        return mock_recitation(attemptId, len(audio_bytes), surah, ayah, level, processing_ms)

    from app import pipeline
    from app.audio import AudioError

    try:
        return pipeline.analyze_recording(audio_bytes, surah, ayah, level, attemptId)
    except AudioError as error:
        # The file is empty or not audio: not an attempt, the API asks the child to record again
        return error_response(400, error.code, str(error))
    except pipeline.ModelFailed as error:
        # The API's fallback saves model "none" and "uncertain", and the teacher sees it
        return error_response(500, "MODEL_FAILED", str(error))
