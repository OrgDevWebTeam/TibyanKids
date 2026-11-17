# Audio decoding (ffmpeg) and the quality gate (docs/ai/audio-io-and-eval-dataset.md, A.3).
import os
import subprocess
import tempfile
from functools import cache

import numpy as np
import torch
from silero_vad import get_speech_timestamps, load_silero_vad

SAMPLE_RATE = 16000

MAX_RECORDING_SECONDS = 60.0
MAX_SPEECH_SECONDS = 30.0  # whisper's input window; a longer reading would look like skipped words
MIN_SECONDS = 0.03
MIN_SPEECH_SECONDS = 0.3
VAD_THRESHOLD = 0.2  # the default 0.5 misses long madd and ghunna sounds
MIN_SPEECH_RATIO = 0.30
MIN_SPEECH_DBFS = -50.0
MIN_SNR_DB = 15.0  # whisper starts to misread reference recitations below about 17 dB
FRAME_SAMPLES = 320  # 20 ms
CLIPPED_LEVEL = 0.976  # 32000 / 32768
MAX_CLIPPED_RATIO = 0.01
PADDING_BEFORE_SECONDS = 0.25
PADDING_AFTER_SECONDS = 3.0  # Silero VAD stops hearing a long final madd early (1:4)

DECODE_TIMEOUT_SECONDS = 15


class AudioError(Exception):
    """The audio could not be read at all (not a quality result)."""

    def __init__(self, code, message):
        """Keeps the contract error code (EMPTY_AUDIO, DECODE_FAILED, DECODE_TIMEOUT)."""
        super().__init__(message)
        self.code = code


def decode_audio(audio_bytes):
    """Any upload as 16 kHz mono float32 samples between -1 and 1."""
    if not audio_bytes:
        raise AudioError("EMPTY_AUDIO", "The audio file is empty")

    with tempfile.TemporaryDirectory() as folder:
        input_path = os.path.join(folder, "input")
        with open(input_path, "wb") as f:
            f.write(audio_bytes)

        # -t: a tiny file can hold a very long recording, so only a little over the limit is decoded
        command = [
            "ffmpeg", "-nostdin", "-loglevel", "error",
            "-i", input_path,
            "-t", str(MAX_RECORDING_SECONDS + 1),
            "-ac", "1", "-ar", str(SAMPLE_RATE),
            "-f", "s16le", "-",
        ]
        try:
            output = subprocess.run(command, capture_output=True, timeout=DECODE_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            raise AudioError("DECODE_TIMEOUT", "Decoding took too long")

    if output.returncode != 0:
        raise AudioError("DECODE_FAILED", "The file is not readable audio")

    samples = np.frombuffer(output.stdout, dtype=np.int16)
    return samples.astype(np.float32) / 32768.0


@cache
def load_vad():
    """The Silero VAD model, loaded once."""
    return load_silero_vad()


def speech_parts(samples):
    """The (start, end) sample positions Silero VAD hears as speech."""
    parts = get_speech_timestamps(
        torch.from_numpy(samples), load_vad(), sampling_rate=SAMPLE_RATE, threshold=VAD_THRESHOLD
    )
    return [(part["start"], part["end"]) for part in parts]


def dbfs(samples):
    """Loudness as RMS in dB below full scale."""
    rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
    return 20 * np.log10(max(rms, 1e-10))


def snr_db(samples):
    """Signal-to-noise ratio in dB: the loudest frames (95th percentile) against the quietest (10th)."""
    count = len(samples) // FRAME_SAMPLES
    if count == 0:
        return 0.0
    frames = samples[: count * FRAME_SAMPLES].reshape(count, FRAME_SAMPLES).astype(np.float64)
    levels = 20 * np.log10(np.maximum(np.sqrt(np.mean(frames**2, axis=1)), 1e-10))
    return float(np.percentile(levels, 95) - np.percentile(levels, 10))


def check_quality(samples, find_speech=None):
    """(quality, report, clip): the first failed rule wins; clip is the reading the models get, or None."""
    find_speech = find_speech or speech_parts
    seconds = len(samples) / SAMPLE_RATE
    report = {"durationSeconds": round(seconds, 2)}

    if seconds > MAX_RECORDING_SECONDS:
        return "too_long", report, None
    if seconds < MIN_SECONDS:
        return "too_short", report, None

    clipped_ratio = float(np.mean(np.abs(samples) >= CLIPPED_LEVEL))
    report["clippedRatio"] = round(clipped_ratio, 4)
    if clipped_ratio > MAX_CLIPPED_RATIO:
        return "too_noisy", report, None

    parts = find_speech(samples)
    speech = sum(end - start for start, end in parts) / SAMPLE_RATE
    report["speechSeconds"] = round(speech, 2)
    if speech < MIN_SPEECH_SECONDS:
        return "silent", report, None

    speech_samples = np.concatenate([samples[start:end] for start, end in parts])
    report["speechDbfs"] = round(dbfs(speech_samples), 1)
    if report["speechDbfs"] < MIN_SPEECH_DBFS:
        return "silent", report, None

    report["snrDb"] = round(snr_db(samples), 1)
    if report["snrDb"] < MIN_SNR_DB:
        return "too_noisy", report, None

    first, last = parts[0][0], parts[-1][1]
    reading_seconds = (last - first) / SAMPLE_RATE
    report["readingSeconds"] = round(reading_seconds, 2)
    if reading_seconds > MAX_SPEECH_SECONDS:
        return "too_long", report, None

    speech_ratio = speech / reading_seconds
    report["speechRatio"] = round(speech_ratio, 2)
    if speech_ratio < MIN_SPEECH_RATIO:
        return "too_noisy", report, None

    start = max(first - int(PADDING_BEFORE_SECONDS * SAMPLE_RATE), 0)
    end = min(last + int(PADDING_AFTER_SECONDS * SAMPLE_RATE), len(samples))
    return "ok", report, samples[start:end]
