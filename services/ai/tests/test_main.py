# The HTTP endpoints (app/main.py) in mock and real mode, with a fake pipeline.
import pytest
from fastapi.testclient import TestClient

from app import pipeline
from app.audio import AudioError
from app.main import MAX_AUDIO_BYTES, app
from app.mock import mock_recitation

client = TestClient(app)


def post(surah=1, ayah=1, audio=b"\x00" * 2000):
    return client.post(
        "/v1/recitation/analyze",
        files={"audio": ("rec.webm", audio, "audio/webm")},
        data={"attemptId": "attempt-1", "surah": str(surah), "ayah": str(ayah), "level": "beginner"},
    )


@pytest.fixture
def real_mode(monkeypatch):
    monkeypatch.setenv("MOCK_MODE", "false")


def test_an_ayah_outside_the_prototype_is_rejected_in_mock_mode():
    response = post(surah=2, ayah=255)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "AYAH_NOT_SUPPORTED"


def test_an_ayah_outside_the_prototype_is_rejected_in_real_mode(real_mode):
    response = post(surah=2, ayah=255)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "AYAH_NOT_SUPPORTED"


def test_a_file_over_5_mb_is_rejected():
    response = post(audio=b"\x00" * (MAX_AUDIO_BYTES + 1))

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "FILE_TOO_LARGE"


def test_the_mock_uses_the_real_segment_of_word_1():
    response = post(surah=1, ayah=3)

    finding = response.json()["findings"][0]
    assert (finding["wordIndex"], finding["wordStartMs"], finding["wordEndMs"]) == (1, 0, 1524)


def test_real_mode_returns_the_pipeline_result(real_mode, monkeypatch):
    result = mock_recitation("attempt-1", 2000, 1, 1)
    monkeypatch.setattr(pipeline, "analyze_recording", lambda *args: result)

    response = post()

    assert response.status_code == 200
    assert response.json()["decision"] == "accepted"


def test_unreadable_audio_is_a_400_with_its_code(real_mode, monkeypatch):
    def broken(*args):
        raise AudioError("DECODE_FAILED", "The file is not readable audio")

    monkeypatch.setattr(pipeline, "analyze_recording", broken)

    response = post()

    assert response.status_code == 400
    assert response.json() == {"error": {"code": "DECODE_FAILED", "message": "The file is not readable audio"}}


def test_a_model_crash_is_a_500_model_failed(real_mode, monkeypatch):
    def broken(*args):
        raise pipeline.ModelFailed("whisper-quran")

    monkeypatch.setattr(pipeline, "analyze_recording", broken)

    response = post()

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "MODEL_FAILED"


def test_any_other_error_is_a_500_in_the_same_error_shape(real_mode, monkeypatch):
    def broken(*args):
        raise ValueError("No word timings for 1:1")

    monkeypatch.setattr(pipeline, "analyze_recording", broken)
    response = TestClient(app, raise_server_exceptions=False).post(
        "/v1/recitation/analyze",
        files={"audio": ("rec.webm", b"\x00" * 2000, "audio/webm")},
        data={"attemptId": "attempt-1", "surah": "1", "ayah": "1", "level": "beginner"},
    )

    assert response.status_code == 500
    assert response.json() == {"error": {"code": "INTERNAL_ERROR", "message": "Unexpected error in the AI service"}}


def test_health_in_real_mode_lists_the_loaded_models(real_mode, monkeypatch):
    monkeypatch.setattr(pipeline, "model_versions", lambda: [{"name": "quran-muaalem", "version": "v1"}])

    body = client.get("/health").json()

    assert body["mockMode"] is False
    assert body["models"] == [{"name": "quran-muaalem", "version": "v1"}]
