# The OD-03 benchmark (scripts/benchmark_arabic_whisper.py) with a fake model and fake GPU memory.
import importlib.util
from pathlib import Path

import numpy as np

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "benchmark_arabic_whisper.py"
spec = importlib.util.spec_from_file_location("benchmark_arabic_whisper", SCRIPT)
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


def test_a_word_is_cut_with_padding_inside_the_recording():
    samples = np.arange(16000 * 2, dtype=np.float32)  # two seconds
    clip = benchmark.cut(samples, 500, 1000)
    assert len(clip) == (1000 - 500 + 2 * benchmark.PADDING_MS) * 16
    assert clip[0] == 400 * 16
    assert len(benchmark.cut(samples, 0, 2000)) == len(samples)  # never outside the recording


def test_the_same_word_ignores_marks_letter_forms_and_spaces():
    assert benchmark.same_word("الحمد", "ٱلْحَمْدُ")
    assert benchmark.same_word(" الرحمن.", "الرَّحْمَٰنِ")
    assert benchmark.same_word("قل هو", "قُلْ هُوَ")
    assert not benchmark.same_word("الحمد", "لله")


def test_measure_size_counts_correct_words_memory_and_time():
    clips = [("1:1", 1, "بسم", np.zeros(10)), ("1:1", 2, "الله", np.zeros(10)), ("1:1", 3, "الرحمن", np.zeros(10))]
    answers = iter(["warm-up", "بِسْمِ", "اللهُ", "الرحيم"])
    memory = iter([2.0, 3.5, 3.6, 3.7, 3.6])
    result = benchmark.measure_size(
        "tiny", clips, load=lambda size: object(), hear=lambda model, samples: next(answers), used=lambda: next(memory)
    )
    assert result["size"] == "tiny"
    assert result["words"] == 3
    assert result["exactMatch"] == round(2 / 3, 3)
    assert result["modelGiB"] == 1.5  # 3.5 after loading - 2.0 before
    assert result["peakTotalGiB"] == 3.7
    assert set(result["secondsPerWord"]) == {"p50", "p95"}


def test_cuda12_folders_are_found_when_the_packages_are_installed():
    from app import cuda12

    folders = cuda12.library_folders()
    try:
        import nvidia.cublas  # noqa: F401
    except ImportError:
        assert folders == []  # not installed: nothing to add, and no error
        return
    assert folders and all(folder.is_dir() for folder in folders)
    assert cuda12.make_findable() == cuda12.make_findable()  # once is enough; a second call changes nothing
