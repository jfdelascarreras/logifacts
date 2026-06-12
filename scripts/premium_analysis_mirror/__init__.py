"""Offline Premium Analysis mirror — parity with lib/premium-analysis (TypeScript)."""

from .engine import compute_invoice_analysis_summary

__all__ = ["compute_invoice_analysis_summary"]


def main(argv=None):
    from .cli import main as cli_main

    return cli_main(argv)
