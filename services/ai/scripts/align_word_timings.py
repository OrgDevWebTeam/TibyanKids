# Proposes word timings for the reference recitation by forced alignment. Owners: Ismail + Qussai.
# Architecture v3.0: word timings come from QUL, or are generated locally (CTC model) and then
# reviewed by ear before they are used. This script is the local generator; its output is a
# proposal until Ismail has listened to every word.
#
# Usage (from services/ai, on the GPU machine):
#   python scripts/align_word_timings.py <folder with SSSAAA.mp3 files> <output .json>
#
# How it works:
#   1. quran_transcript turns each ayah's Uthmani text into the phonemes quran-muaalem uses, and
#      maps every Uthmani letter to its phonemes, so each word has a known run of phonemes.
#   2. quran-muaalem (a CTC model, one frame every ~40 ms) gives the probability of every phoneme in
#      every frame. The known phoneme sequence is force-aligned to those frames (CTC Viterbi), which
#      gives the frames of each phoneme, and so of each word.
#   3. In connected recitation words run into each other, so a word ends where the next one starts.
#      Only a real pause (PAUSE_FRAMES or more of silence) leaves a gap; then the word ends KEEP_FRAMES
#      after its last phoneme. Each word starts BACK_FRAMES early so its first sound is not cut.
#
# These three values were chosen by cutting each word out of the reference audio and asking
# whisper-quran what it hears (2026-11-15): 51 of 97 words recognised, against 18 with the earlier
# hand-made timings, and no word shorter than 200 ms (22 before).
#
# Recordings are never copied into the repository (it is public).
import json
import sys
from pathlib import Path

import numpy as np
import torch
from quran_transcript import quran_phonetizer

# Lets this script do "from app..." like the service does
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.adapters import muaalem  # noqa: E402
from app.audio import SAMPLE_RATE, decode_audio  # noqa: E402
from app.reference import get_ayah  # noqa: E402

PAUSE_FRAMES = 10  # about 400 ms of silence between two words counts as a pause
KEEP_FRAMES = 3  # before a pause, a word ends about 120 ms after its last phoneme
BACK_FRAMES = 1  # a word starts about 40 ms before its first phoneme
BLANK = 0  # the CTC blank of quran-muaalem's phoneme level ([PAD])


def ctc_viterbi(log_probs, labels):
    """
    The most likely CTC path for a known label sequence. log_probs: frames x vocabulary.
    Returns, for every frame, the position of its label in `labels`, or -1 for a blank frame.
    """
    frames = log_probs.shape[0]
    states = [BLANK]
    for label in labels:
        states += [label, BLANK]
    count = len(states)
    score = np.full((frames, count), -np.inf)
    back = np.zeros((frames, count), dtype=np.int64)
    score[0, 0] = log_probs[0, states[0]]
    score[0, 1] = log_probs[0, states[1]]
    for t in range(1, frames):
        for s in range(count):
            # Stay, move one state on, or skip a blank between two different labels
            options = [(score[t - 1, s], s)]
            if s >= 1:
                options.append((score[t - 1, s - 1], s - 1))
            if s >= 2 and states[s] != BLANK and states[s] != states[s - 2]:
                options.append((score[t - 1, s - 2], s - 2))
            best, previous = max(options)
            score[t, s] = best + log_probs[t, states[s]]
            back[t, s] = previous
    if not np.isfinite(score[-1, -1]) and not np.isfinite(score[-1, -2]):
        raise ValueError("the recording is too short for the ayah's phonemes")
    s = count - 1 if score[-1, -1] >= score[-1, -2] else count - 2
    path = [0] * frames
    for t in range(frames - 1, -1, -1):
        path[t] = (s - 1) // 2 if s % 2 == 1 else -1
        s = back[t, s]
    return path


def word_frames(model, samples, uthmani_text):
    """Returns ([(first frame, last frame + 1) per word], milliseconds per frame)."""
    reference = quran_phonetizer(uthmani_text, muaalem.moshaf_settings(), remove_spaces=True)
    labels = model.multi_level_tokenizer.tokenize(
        [reference.phonemes], [reference.sifat], to_dict=True, return_tensors="pt", padding="longest"
    )["input_ids"]["phonemes"][0].tolist()

    features = model.processor([samples], sampling_rate=SAMPLE_RATE, return_tensors="pt")
    features = {k: v.to("cuda", dtype=model.dtype) for k, v in features.items()}
    with torch.no_grad():
        output = model.model(**features, return_dict=False)[0]
    log_probs = output["phonemes"][0].float().log_softmax(-1).cpu().numpy()
    frame_ms = len(samples) / (SAMPLE_RATE / 1000) / log_probs.shape[0]

    frames_of = {}
    for t, position in enumerate(ctc_viterbi(log_probs, labels)):
        if position >= 0:
            frames_of.setdefault(position, []).append(t)

    # Each Uthmani letter maps to a run of phonemes; a word's phonemes are those of its letters
    spans, letter = [], 0
    for word in uthmani_text.split(" "):
        kept = [m for m in reference.mappings[letter : letter + len(word)] if not m.deleted]
        first, last = min(m.pos[0] for m in kept), max(m.pos[1] for m in kept)
        frames = [t for p in range(first, last) for t in frames_of.get(p, [])]
        spans.append((min(frames), max(frames) + 1))
        letter += len(word) + 1
    return spans, frame_ms


def word_timings(spans, frame_ms, total_ms):
    """Word start and end in milliseconds from the frames of each word (rules at the top)."""
    starts, ends = [0], []
    for (_, end), (next_start, _) in zip(spans, spans[1:]):
        start = max(next_start - BACK_FRAMES, end)
        stop = min(end + KEEP_FRAMES, start) if next_start - end >= PAUSE_FRAMES else start
        ends.append(round(stop * frame_ms))
        starts.append(round(start * frame_ms))
    ends.append(total_ms)
    return list(zip(starts, ends))


def main():
    if len(sys.argv) != 3:
        print("Usage: python scripts/align_word_timings.py <folder> <output.json>")
        sys.exit(1)
    folder, output = Path(sys.argv[1]), Path(sys.argv[2])
    model = muaalem.load_model()

    result = []
    for file in sorted(folder.glob("*.mp3")):
        surah, ayah_id = int(file.stem[:3]), int(file.stem[3:])
        ayah = get_ayah(surah, ayah_id)
        if ayah is None:
            print(f"{file.stem}: skipped, not one of the 25 prototype ayat")
            continue
        samples = decode_audio(file.read_bytes())
        total_ms = round(len(samples) / (SAMPLE_RATE / 1000))
        spans, frame_ms = word_frames(model, samples, ayah["text_uthmani"])
        times = word_timings(spans, frame_ms, total_ms)
        result.append(
            {
                "surah_id": surah,
                "ayah_id": ayah_id,
                "audio_file": file.name,
                "total_duration_ms": total_ms,
                "words": [
                    {"position": w["position"], "text": w["text"], "start_ms": start, "end_ms": end}
                    for w, (start, end) in zip(ayah["words"], times)
                ],
            }
        )
        shortest = min(end - start for start, end in times)
        print(f"{file.stem}: {len(times)} words, shortest {shortest} ms")

    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Written: {output} ({len(result)} ayat). Listen to every word before using it.")


if __name__ == "__main__":
    main()
