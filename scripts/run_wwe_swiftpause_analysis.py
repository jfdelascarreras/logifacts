#!/usr/bin/env python3
"""Run offline WWE analysis on the Swiftpause example XLS invoices."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from premium_analysis_mirror.cli import main

SWIFTPAUSE_DIR = (
    Path(__file__).resolve().parents[1]
    / "Invoices skills"
    / "examples"
    / "WWE_Swiftpause"
)

if __name__ == "__main__":
    default_argv = [
        "--input-dir",
        str(SWIFTPAUSE_DIR),
        "--no-recursive",
        "--output-name",
        "wwe_swiftpause_analysis.xlsx",
        "--combined-file",
        "wwe_swiftpause_invoice_mapped.xlsx",
        "--title",
        "WWE Swiftpause Invoice KPI Analysis",
    ]
    raise SystemExit(main(sys.argv[1:] if len(sys.argv) > 1 else default_argv))
