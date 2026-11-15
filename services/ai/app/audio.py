# Audio decoding and the quality gate (FR-QUR-003, VAL-014). Owner: Qussai.
# Rules: docs/ai/audio-io-and-eval-dataset.md, section A.3.
#
# 1. decode_audio() turns any upload (webm, mp4, ogg, wav, mp3) into 16 kHz mono samples with ffmpeg.
# 2. check_quality() measures the samples and returns one of the contract qualities:
#    ok, silent, too_short, too_noisy, too_long. For an ok recording it also returns the clip the
#    models get: the reading itself, without the silence before and after it.
# A rejected recording is not an attempt and never reaches the models.
#
# Needs ffmpeg on PATH. The speech check needs the packages in requirements-gpu.txt (torch,
# silero-vad); they are imported only when it runs, so the rules can be tested without them.
import os
import subprocess
import tempfile

import numpy as np

SAMPLE_RATE = 16000  # the models need 16 kHz mono

# Gate values. Starting values, tuned later against real recordings.
# A child may wait before reading, so the recording can be longer than the reading itself.
MAX_RECORDING_SECONDS = 60.0  # longer recording -> too_long
# Whisper's input window is 30 s: a longer reading would be cut and look like skipped words.
MAX_SPEECH_SECONDS = 30.0  # longer reading (first to last speech, without silence around it) -> too_long
MIN_SECONDS = 0.03  # shorter (or empty) -> too_short
MIN_SPEECH_SECONDS = 0.3  # less speech than this -> silent
# Silero VAD sensitivity. Its default (0.5) misses long madd and ghunna sounds of recitation,
# so clean recordings came back too_noisy. 0.2 passed all 50 clean test recordings.
VAD_THRESHOLD = 0.2
MIN_SPEECH_RATIO = 0.30  # speech seconds / reading seconds below this -> too_noisy
MIN_SPEECH_DBFS = -50.0  # speech quieter than this (RMS of the speech parts) -> silent
# Signal-to-noise ratio: the loud frames against the quiet ones. Whisper starts to misread clean
# reference recitations with added noise below about 17 dB; clean ones measure 22.9 dB or more.
MIN_SNR_DB = 15.0  # below this -> too_noisy
FRAME_SAMPLES = 320  # 20 ms frames for the SNR
CLIPPED_LEVEL = 0.976  # |sample| at or above this counts as clipped (32000 / 32768)
MAX_CLIPPED_RATIO = 0.01  # more than 1% clipped samples -> too_noisy
# Audio kept around the reading in the clip for the models. Silero VAD stops hearing a long final
# madd early (1:4: speech "ends" at 2.6 s, the madd of ٱلدِّينِ lasts until 4.6 s), so much more is
# kept after the reading. With 3 s, muaalem gives the same results as on the untrimmed recordings
# for all 25 reference ayat; with 0.25 s it misread 1:4.
PADDING_BEFORE_SECONDS = 0.25
PADDING_AFTER_SECONDS = 3.0

DECODE_TIMEOUT_SECONDS = 15

vad_model = None


class AudioError(Exception):
    """The audio could not be read at all. This is not a quality result."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def decode_audio(audio_bytes):
    """Returns the recording as 16 kHz mono float32 samples between -1 and 1."""
    if not audio_bytes:
        raise AudioError("EMPTY_AUDIO", "The audio file is empty")

    with tempfile.TemporaryDirectory() as folder:
        input_path = os.path.join(folder, "input")
        with open(input_path, "wb") as f:
            f.write(audio_bytes)

        # Decode a little more than the limit only: a tiny file can hold a very long recording
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


def speech_parts(samples):
    """The parts Silero VAD hears as speech, as a list of (start, end) sample positions."""
    global vad_model
    import torch
    from silero_vad import get_speech_timestamps, load_silero_vad

    if vad_model is None:
        vad_model = load_silero_vad()

    parts = get_speech_timestamps(
        torch.from_numpy(samples), vad_model, sampling_rate=SAMPLE_RATE, threshold=VAD_THRESHOLD
    )
    return [(part["start"], part["end"]) for part in parts]


def dbfs(samples):
    """Loudness as RMS in dB below full scale (0 dBFS = the loudest possible sound)."""
    rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
    return 20 * np.log10(max(rms, 1e-10))


def snr_db(samples):
    """
    Signal-to-noise ratio in dB: the loudness of the loudest frames (95th percentile) against the
    quietest (10th percentile), which are the background between and around the words.
    """
    count = len(samples) // FRAME_SAMPLES
    if count == 0:
        return 0.0
    frames = samples[: count * FRAME_SAMPLES].reshape(count, FRAME_SAMPLES).astype(np.float64)
    levels = 20 * np.log10(np.maximum(np.sqrt(np.mean(frames**2, axis=1)), 1e-10))
    return float(np.percentile(levels, 95) - np.percentile(levels, 10))


def check_quality(samples, find_speech=None):
    """
    Returns (quality, report, clip). The report holds numbers only, so it is safe to log.
    clip is the reading the models get (speech plus a little padding), or None when rejected.
    find_speech replaces Silero VAD in tests.
    """
    find_speech = find_speech or speech_parts
    seconds = len(samples) / SAMPLE_RATE
    report = {"durationSeconds": round(seconds, 2)}

    # Checked in this order, the first match wins
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

    # After the speech checks: a recording with no speech has no contrast either, but it is silent
    report["snrDb"] = round(snr_db(samples), 1)
    if report["snrDb"] < MIN_SNR_DB:
        return "too_noisy", report, None

    # The reading: from the first speech to the last, without the silence around it
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
    clip = samples[start:end]
    return "ok", report, clip
