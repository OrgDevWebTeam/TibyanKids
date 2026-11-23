# CTranslate2 (inside faster-whisper, the Arabic words stage) is built for CUDA 12, but our torch is
# built for CUDA 13 and ships only CUDA 13 libraries. The CUDA 12 libraries CTranslate2 needs come
# from the pip packages nvidia-cublas-cu12 and nvidia-cudnn-cu12 (requirements-gpu.txt). This file
# makes them findable. Call make_findable() once, before a faster-whisper model is loaded.
import ctypes
import os
import sys
from functools import cache
from pathlib import Path

PACKAGES = ["nvidia.cublas", "nvidia.cudnn"]

# Linux: loaded in this order, so cuDNN finds cuBLAS
LINUX_LIBRARIES = ["libcublasLt.so.12", "libcublas.so.12", "libcudnn.so.9"]


def library_folders():
    """The folders of the CUDA 12 libraries installed by pip: bin/ on Windows, lib/ on Linux."""
    folders = []
    for name in PACKAGES:
        try:
            package = __import__(name, fromlist=["__path__"])
        except ImportError:
            continue
        root = Path(list(package.__path__)[0])
        folders += [root / sub for sub in ("bin", "lib") if (root / sub).is_dir()]
    return folders


@cache
def make_findable():
    """Lets CTranslate2 load cuBLAS 12 and cuDNN 9. Returns the folders used (empty: not installed)."""
    folders = library_folders()
    if sys.platform == "win32":
        for folder in folders:
            os.add_dll_directory(str(folder))
        # CTranslate2 loads cuBLAS by name when it first needs it, which searches PATH
        os.environ["PATH"] = os.pathsep.join([str(f) for f in folders] + [os.environ.get("PATH", "")])
    else:
        for name in LINUX_LIBRARIES:
            for folder in folders:
                if (folder / name).exists():
                    ctypes.CDLL(str(folder / name), mode=ctypes.RTLD_GLOBAL)
                    break
    return folders
