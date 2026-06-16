#!/usr/bin/env python3
"""Alias for run_invoice_analysis.py — same Premium Analysis offline mirror."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from run_invoice_analysis import _dispatch

if __name__ == "__main__":
    raise SystemExit(_dispatch())
