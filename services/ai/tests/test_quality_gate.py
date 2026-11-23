# The quality gate rules (app/audio.py) with generated audio and a fake VAD.
import numpy as np
import pytest

from app import audio
from app.audio import SAMPLE_RATE, check_quality

rng = np.random.default_rng(0)


def background(seconds, level=0.001):
    """Quiet room noise, about -60 dBFS."""
    return rng.normal(0, level, int(seconds * SAMPLE_RATE)).astype(np.float32)


def tone(seconds, amplitude=0.1):
    """A steady tone standing in for speech, about -23 dBFS at the default amplitude."""
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return (amplitude * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


def recording(*pieces):
    """Joins (kind, seconds) pieces. Returns the samples and the fake VAD that hears the tones."""
    samples, parts, position = [], [], 0
    for kind, seconds, *amplitude in pieces:
        piece = tone(seconds, *amplitude) if kind == "speech" else background(seconds)
        if kind == "speech":
            piece = piece + background(seconds)
            parts.append((position, position + len(piece)))
        samples.append(piece)
        position += len(piece)
    return np.concatenate(samples).astype(np.float32), lambda _samples: parts


def never_called(_samples):
    """A speech finder that must not be called."""
    raise AssertionError("the speech check should not run for this recording")


def test_a_clean_reading_is_ok_and_the_clip_is_the_reading():
    """A clean reading is ok and the clip is the reading."""
    samples, vad = recording(("silence", 1), ("speech", 3), ("silence", 1))
    quality, report, clip = check_quality(samples, vad)
    assert quality == "ok"
    assert len(clip) == int(4.25 * SAMPLE_RATE)
    assert report["readingSeconds"] == 3.0


def test_waiting_before_reading_is_not_noise():
    """Waiting before reading is not noise."""
    samples, vad = recording(("silence", 20), ("speech", 3), ("silence", 1))
    quality, _, clip = check_quality(samples, vad)
    assert quality == "ok"
    assert len(clip) == int(4.25 * SAMPLE_RATE)


def test_silence_after_the_reading_is_cut_after_3_seconds():
    """Silence after the reading is cut after 3 seconds."""
    samples, vad = recording(("silence", 1), ("speech", 3), ("silence", 20))
    quality, _, clip = check_quality(samples, vad)
    assert quality == "ok"
    assert len(clip) == int(6.25 * SAMPLE_RATE)


def test_an_empty_recording_is_too_short():
    """An empty recording is too short."""
    assert check_quality(np.zeros(0, dtype=np.float32), never_called)[0] == "too_short"


def test_a_recording_over_the_limit_is_too_long():
    """A recording over the limit is too long."""
    samples = background(audio.MAX_RECORDING_SECONDS + 1)
    assert check_quality(samples, never_called)[0] == "too_long"


def test_a_reading_over_30_seconds_is_too_long():
    """A reading over 30 seconds is too long."""
    samples, vad = recording(("silence", 2), ("speech", 31), ("silence", 2))
    quality, report, clip = check_quality(samples, vad)
    assert quality == "too_long"
    assert clip is None
    assert report["readingSeconds"] == 31.0


def test_clipped_audio_is_too_noisy():
    """Clipped audio is too noisy."""
    samples, vad = recording(("speech", 3, 1.2))
    samples = np.clip(samples, -1, 1)
    assert check_quality(samples, vad)[0] == "too_noisy"


def test_no_speech_is_silent():
    """No speech is silent."""
    samples, _ = recording(("silence", 3))
    assert check_quality(samples, lambda _samples: [])[0] == "silent"


def test_very_quiet_speech_is_silent():
    """Very quiet speech is silent."""
    samples, vad = recording(("silence", 1), ("speech", 3, 0.0005), ("silence", 1))
    quality, report, _ = check_quality(samples, vad)
    assert quality == "silent"
    assert report["speechDbfs"] < audio.MIN_SPEECH_DBFS


def test_speech_in_loud_noise_is_too_noisy():
    """Speech in loud noise is too noisy."""
    samples, vad = recording(("speech", 3))
    samples = samples + rng.normal(0, 0.07, len(samples)).astype(np.float32)
    quality, report, _ = check_quality(samples, vad)
    assert quality == "too_noisy"
    assert report["snrDb"] < audio.MIN_SNR_DB


def test_little_speech_inside_the_reading_is_too_noisy():
    """Little speech inside the reading is too noisy."""
    samples, vad = recording(("speech", 0.3), ("silence", 5), ("speech", 0.3))
    quality, report, _ = check_quality(samples, vad)
    assert quality == "too_noisy"
    assert report["speechRatio"] < audio.MIN_SPEECH_RATIO


def test_the_report_holds_numbers_only():
    """The report holds numbers only."""
    samples, vad = recording(("silence", 1), ("speech", 3), ("silence", 1))
    _, report, _ = check_quality(samples, vad)
    assert all(isinstance(value, (int, float)) for value in report.values())


@pytest.mark.parametrize("seconds", [0, 0.01])
def test_snr_of_very_short_audio_is_zero(seconds):
    """Snr of very short audio is zero."""
    assert audio.snr_db(background(seconds)) == 0.0


def test_measure_gives_every_number_for_a_clean_reading():
    """Measure gives every number for a clean reading."""
    samples, vad = recording(("silence", 1), ("speech", 3), ("silence", 1))
    numbers = audio.measure_recording(samples, vad)
    assert numbers["durationSeconds"] == 5.0
    assert numbers["speechSeconds"] == 3.0
    assert numbers["readingSeconds"] == 3.0
    assert numbers["speechRatio"] == 1.0
    assert numbers["snrDb"] > audio.MIN_SNR_DB
    assert numbers["speechDbfs"] > audio.MIN_SPEECH_DBFS


def test_measure_matches_the_numbers_the_gate_reached():
    """Measure matches the numbers the gate reached."""
    samples, vad = recording(("silence", 1), ("speech", 2), ("silence", 1))
    _, report, _ = check_quality(samples, vad)
    numbers = audio.measure_recording(samples, vad)
    assert {key: numbers[key] for key in report} == report


def test_measure_goes_on_after_a_rule_the_gate_stops_at():
    """A clipped recording stops the gate at the clipping rule; the speech numbers are still measured."""
    samples, vad = recording(("silence", 1), ("speech", 2, 1.2), ("silence", 1))
    quality, report, _ = check_quality(samples, vad)
    assert quality == "too_noisy" and "speechSeconds" not in report
    assert audio.measure_recording(samples, vad)["speechSeconds"] == 2.0


def test_measure_with_no_speech_leaves_the_speech_numbers_empty():
    """Measure with no speech leaves the speech numbers empty."""
    samples = background(2)
    numbers = audio.measure_recording(samples, lambda _samples: [])
    assert numbers["speechSeconds"] == 0.0
    assert numbers["speechDbfs"] is None
    assert numbers["readingSeconds"] is None
    assert numbers["speechRatio"] is None
