# The AI service's HTTP endpoints (internal only): mock results, or the real models with MOCK_MODE=false.
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import pipeline
from app.audio import AudioError
from app.mock import MOCK_MODEL, MOCK_VERSION, mock_recitation
from app.reference import get_ayah
from app.schemas import AnalysisResult, Level

MAX_AUDIO_BYTES = 5 * 1024 * 1024  # same limit as the API (VAL-016)

logging.basicConfig(level=logging.INFO, format="%(message)s")


def is_mock_mode():
    """MOCK_MODE, read on every call."""
    return os.environ.get("MOCK_MODE", "true").lower() == "true"


@asynccontextmanager
async def lifespan(app):
    """Loads the real models before the service answers, unless in mock mode."""
    if not is_mock_mode():
        pipeline.load_models()
    yield


app = FastAPI(title="Tibyan Kids AI service", lifespan=lifespan)


def error_response(status, code, message):
    """The error shape the API also uses: {"error": {"code", "message"}}."""
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc):
    """400 VALIDATION_ERROR naming the first wrong field."""
    first = exc.errors()[0]
    field = ".".join(str(part) for part in first["loc"][1:]) or "body"
    return error_response(400, "VALIDATION_ERROR", f"{field}: {first['msg']}")


@app.exception_handler(Exception)
async def unexpected_error_handler(request, exc):
    """500 INTERNAL_ERROR in the same shape; the traceback still goes to the log."""
    return error_response(500, "INTERNAL_ERROR", "Unexpected error in the AI service")


@app.get("/health")
def health():
    """Status, mock mode and the models with their versions."""
    if is_mock_mode():
        models = [{"name": MOCK_MODEL, "version": MOCK_VERSION}]
    else:
        models = pipeline.model_versions()
    return {"status": "ok", "mockMode": is_mock_mode(), "models": models}


# Not async: FastAPI runs it in a thread, so /health answers while a request waits for the GPU
@app.post("/v1/recitation/analyze", response_model=AnalysisResult)
def analyze_recitation(
    audio: UploadFile = File(...),
    attemptId: str = Form(...),
    surah: int = Form(..., ge=1, le=114),
    ayah: int = Form(..., ge=1),
    level: Level = Form(...),
):
    """Checks one recorded ayah and returns one result (docs/contracts/ai-result.md)."""
    started = time.perf_counter()

    if get_ayah(surah, ayah) is None:
        return error_response(400, "AYAH_NOT_SUPPORTED", f"{surah}:{ayah} is not a prototype ayah")

    audio_bytes = audio.file.read(MAX_AUDIO_BYTES + 1)
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return error_response(400, "FILE_TOO_LARGE", "The file is too large")

    if is_mock_mode():
        processing_ms = int((time.perf_counter() - started) * 1000)
        return mock_recitation(attemptId, len(audio_bytes), surah, ayah, level, processing_ms)

    try:
        return pipeline.analyze_recording(audio_bytes, surah, ayah, level, attemptId)
    except AudioError as error:
        return error_response(400, error.code, str(error))
    except pipeline.ModelFailed as error:
        return error_response(500, "MODEL_FAILED", str(error))
