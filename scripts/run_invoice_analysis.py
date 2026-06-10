#!/usr/bin/env python3
"""Run offline multi-carrier invoice analysis from the repo root or scripts folder."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from invoice_analysis.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
