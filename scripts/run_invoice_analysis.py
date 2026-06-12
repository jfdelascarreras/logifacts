#!/usr/bin/env python3
"""Offline invoice analysis — uses premium_analysis_mirror (TS engine parity)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def _dispatch() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "--golden":
        from premium_analysis_mirror.test_golden import run_golden_test

        run_golden_test()
        return 0
    from premium_analysis_mirror.cli import main

    return main()


if __name__ == "__main__":
    raise SystemExit(_dispatch())
