# The OD-03 benchmark (scripts/benchmark_arabic_whisper.py) with a fake model and fake GPU memory.
import importlib.util
from pathlib import Path

import numpy as np

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "benchmark_arabic_whisper.py"
spec = importlib.util.spec_from_file_location("benchmark_arabic_whisper", SCRIPT)
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)

TIMINGS = {1: (0, 500), 2: (540, 1000), 3: (1400, 2000)}  # a 40 ms gap, then a 400 ms gap


# Cutting


def test_padding_stops_at_half_the_gap_to_a_neighbour():
    assert benchmark.padded_bounds(TIMINGS, 2, 3000) == (520, 1100)  # 20 ms before (half of 40), 100 ms after


def test_padding_never_leaves_the_recording():
    assert benchmark.padded_bounds(TIMINGS, 1, 3000) == (0, 520)
    assert benchmark.padded_bounds(TIMINGS, 3, 2050) == (1300, 2050)


def test_overlapping_timings_get_no_padding():
    assert benchmark.padded_bounds({1: (0, 600), 2: (550, 900)}, 2, 3000) == (550, 1000)


def test_cut_takes_the_samples_between_two_times():
    samples = np.arange(16000, dtype=np.float32)
    clip = benchmark.cut(samples, 500, 750)
    assert len(clip) == 250 * 16 and clip[0] == 500 * 16


# Comparing


def test_exact_ignores_marks_letter_forms_and_punctuation():
    assert benchmark.matches("الحمد.", "ٱلْحَمْدُ", "exact")
    assert not benchmark.matches("الرحمن الرحيم", "الرَّحْمَٰنِ", "exact")


def test_contains_accepts_a_neighbour_word_leaking_in():
    assert benchmark.matches("الرحمن الرحيم", "الرَّحْمَٰنِ", "contains")
    assert not benchmark.matches("الفلاق", "ٱلْفَلَقِ", "contains")


def test_close_accepts_one_letter_more_or_less():
    assert benchmark.matches("الفلاق", "ٱلْفَلَقِ", "close")  # a held madd written as an alif
    assert benchmark.matches("رحيم", "ٱلرَّحِيمِ", "close") is False  # two letters (ال) apart
    assert not benchmark.matches("لله", "ٱلْحَمْدُ", "close")


def test_edit_distance():
    assert benchmark.edit_distance("فصل", "فصلل") == 1
    assert benchmark.edit_distance("كتب", "كتب") == 0
    assert benchmark.edit_distance("", "من") == 2


def test_an_invented_phrase_is_invented():
    assert benchmark.made_up_words("اشتركوا في القناة", "ٱهْدِنَا", ["ٱلصِّرَٰطَ"]) == "invented"


def test_a_guessed_next_word_is_extra_words():
    assert benchmark.made_up_words("ولم يتعلم", "وَلَمْ", ["يَكُن"]) == "extra words"


def test_the_word_or_its_neighbour_is_not_made_up():
    assert benchmark.made_up_words("الرحمن الرحيم", "ٱلرَّحْمَٰنِ", ["ٱلرَّحِيمِ"]) is None
    assert benchmark.made_up_words("", "ٱلرَّحْمَٰنِ", []) is None


def test_a_held_sound_written_as_repeated_letters_is_the_same_word():
    assert benchmark.words_of("ووووووو") == ["و"]
    assert benchmark.matches("هووووو", "هُوَ", "exact")
    assert benchmark.matches("الله", "ٱللَّهِ", "exact")  # both sides lose the double lam the same way


def test_the_wrong_word_is_never_the_same_word():
    clips = [{"expected": word} for word in ["مِن", "شَرِّ", "مِنْ", "قُلْ"]]
    for index in range(len(clips)):
        other = benchmark.wrong_word_for(clips, index)
        assert benchmark.words_of(other) != benchmark.words_of(clips[index]["expected"])


# Scoring one size


def clip(expected, neighbours=()):
    return {
        "ayah": "1:1",
        "position": 1,
        "expected": expected,
        "neighbours": list(neighbours),
        "samples": np.zeros(10),
    }


def test_score_counts_correct_false_accept_and_made_up_words():
    clips = [clip("بِسْمِ"), clip("ٱللَّهِ"), clip("ٱلرَّحْمَٰنِ", ["ٱلرَّحِيمِ"]), clip("وَلَمْ", ["يَكُن"])]
    transcripts = ["بسم", "شكرا للمشاهدة", "الرحمن الرحيم", "ولم يتعلم"]
    result = benchmark.score(clips, transcripts)
    assert result["clips"] == 4
    assert result["rules"]["exact"]["correct"] == 0.25
    assert result["rules"]["contains"]["correct"] == 0.75
    assert result["rules"]["contains"]["falseAccept"] == 0.0  # no clip matches another clip's word
    assert result["inventedRate"] == 0.25
    assert result["extraWordsRate"] == 0.25


def test_short_clips_are_scored_apart():
    short = {**clip("بِسْمِ"), "samples": np.zeros(8000)}  # half a second
    long = {**clip("ٱللَّهِ"), "samples": np.zeros(32000)}  # two seconds
    result = benchmark.score([short, long], ["شكرا", "الله"])
    assert result["shortClips"]["clips"] == 1
    assert result["shortClips"]["inventedRate"] == 1.0
    assert result["inventedRate"] == 0.5


def test_measure_size_records_memory_time_and_scores():
    clips = [clip("بِسْمِ"), clip("ٱللَّهِ"), clip("ٱلرَّحْمَٰنِ")]
    answers = iter(["warm-up", "بسم", "الله", "الرحيم"])
    memory = iter([2.0, 3.5, 3.6, 3.7, 3.6])

    def fake_load(_size):
        return object()

    def fake_hear(_model, _samples):
        return next(answers)

    def fake_used():
        return next(memory)

    result = benchmark.measure_size("tiny", clips, load=fake_load, hear=fake_hear, used=fake_used)
    assert result["size"] == "tiny" and result["words"] == 3
    assert result["modelGiB"] == 1.5  # 3.5 after loading - 2.0 before
    assert result["peakTotalGiB"] == 3.7
    assert result["rules"]["exact"]["correct"] == round(2 / 3, 3)
    assert set(result["secondsPerWord"]) == {"p50", "p95"}
    assert result["transcripts"][0] == {"ayah": "1:1", "position": 1, "heard": "بسم"}
