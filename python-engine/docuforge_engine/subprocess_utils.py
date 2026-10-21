"""Run an external program so that the job can be cancelled and nothing is left running."""

from __future__ import annotations

import os
import signal
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from .context import JobContext
from .errors import CONVERSION_FAILED, EngineError


def kill_tree(process: subprocess.Popen[bytes]) -> None:
    """Stops the program and any helper programs it started."""
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, check=False
            )
        else:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        pass
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass


def run_cancellable(
    command: list[str],
    ctx: JobContext,
    *,
    timeout: float,
    capture_stdout: bool = False,
    env: dict[str, str] | None = None,
) -> tuple[int, bytes]:
    """Runs `command` (an argument list, never a shell string). Returns (exit code, stdout bytes).

    Checks for cancellation every 0.2 s and stops the program if the job is cancelled or if it
    runs longer than `timeout` seconds.
    """
    options: dict[str, Any] = {}
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NO_WINDOW  # type: ignore[attr-defined]
    else:
        options["start_new_session"] = True

    # Output goes to a temp file, not a pipe, so a chatty program can never block on a full pipe.
    with tempfile.TemporaryFile() as captured:
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=captured if capture_stdout else subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
            **options,
        )
        deadline = time.monotonic() + timeout
        try:
            while True:
                try:
                    exit_code = process.wait(timeout=0.2)
                    break
                except subprocess.TimeoutExpired:
                    pass
                ctx.check_cancelled()
                if time.monotonic() > deadline:
                    raise EngineError(CONVERSION_FAILED, "The operation took too long and was stopped.")
        except BaseException:
            kill_tree(process)
            raise
        captured.seek(0)
        return exit_code, captured.read() if capture_stdout else b""


def program_output(command: list[str], timeout: float = 20) -> str | None:
    """Runs a quick program (for example `tesseract --list-langs`) and returns its output, or None."""
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            timeout=timeout,
            check=False,
            stdin=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,  # type: ignore[attr-defined]
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0:
        return None
    return (completed.stdout + b"\n" + completed.stderr).decode("utf-8", errors="replace")


def which_in(directory: Path, name: str) -> Path | None:
    candidate = directory / name
    return candidate if candidate.is_file() else None
