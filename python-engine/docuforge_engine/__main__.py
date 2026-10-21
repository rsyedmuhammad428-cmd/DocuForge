"""Entry point: `python -m docuforge_engine`. Runs exactly one request, then exits.

`python -m docuforge_engine --check` prints what is installed instead.
"""

from __future__ import annotations

import sys
import threading
import traceback

from .context import JobContext, watch_for_cancel
from .errors import INTERNAL, UNKNOWN_OPERATION, EngineError, describe_exception
from .operations import package_problem, resolve_operation
from .protocol import Protocol, parse_request


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        from .selfcheck import run_check

        return run_check()

    protocol = Protocol(sys.stdout)
    sys.stdout = sys.stderr  # Keep stdout clean for protocol messages.
    reconfigure = getattr(sys.stdin, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8")

    try:
        request = parse_request(sys.stdin.readline())
        operation = resolve_operation(request.op)
        if operation is None:
            raise EngineError(UNKNOWN_OPERATION, "The requested operation is not supported.")

        cancel_event = threading.Event()
        watch_for_cancel(sys.stdin, cancel_event)
        context = JobContext(request.job_id, protocol, cancel_event)

        protocol.result(operation(request.args, context))
        return 0
    except EngineError as error:
        protocol.error(error.code, error.message)
        return 1
    except ImportError as exc:
        # A package that is only needed part-way through an operation turned out to be missing.
        traceback.print_exc()
        problem = package_problem(exc)
        protocol.error(problem.code, problem.message)
        return 1
    except Exception as exc:  # noqa: BLE001 - last resort so the app always gets a final message.
        # The full traceback goes to stderr. The message names the kind of error so a problem on
        # someone's computer can be diagnosed, without showing a wall of text.
        traceback.print_exc()
        protocol.error(INTERNAL, f"The operation failed unexpectedly. ({describe_exception(exc)})")
        return 1


if __name__ == "__main__":
    sys.exit(main())
