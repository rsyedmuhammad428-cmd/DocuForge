"""Entry point of the packaged engine (PyInstaller). Same behavior as `python -m docuforge_engine`."""

import multiprocessing
import sys

from docuforge_engine.__main__ import main

if __name__ == "__main__":
    multiprocessing.freeze_support()  # harmless unless a dependency starts worker processes on Windows
    sys.exit(main())
