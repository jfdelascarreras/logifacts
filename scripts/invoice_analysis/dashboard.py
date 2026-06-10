"""Optional Dash dashboard (local only — not served by the Next.js app)."""

from __future__ import annotations

import dash
import dash_bootstrap_components as dbc
from dash import html

from .analyze import AnalysisResult


def create_dashboard(result: AnalysisResult, *, title: str, files_loaded: int, rows_dropped_sci: int, rows_dropped_charge_dedupe: int) -> dash.Dash:
    app = dash.Dash(__name__, external_stylesheets=[dbc.themes.DARKLY])
    app.title = title

    app.layout = dbc.Container([
        html.H1(title, className="text-center mt-4 mb-2"),
        html.Div(
            f"Rows analyzed: {len(result.df):,} | Files loaded: {files_loaded:,} | "
            f"Sci-notation rows dropped: {rows_dropped_sci} | "
            f"Duplicate charge rows dropped: {rows_dropped_charge_dedupe}",
            className="text-center mb-4",
            style={"opacity": 0.75},
        ),
        html.H3("Summary Totals", className="mt-4 mb-3"),
        dbc.Table.from_dataframe(result.summary_totals_table, striped=True, bordered=True, hover=True, responsive=True, className="mb-5"),
        html.H3("Ingest Diagnostics", className="mt-4 mb-3"),
        dbc.Table.from_dataframe(result.diagnostics_table, striped=True, bordered=True, hover=True, responsive=True, className="mb-5"),
        html.H3("Cost by Carrier", className="mt-4 mb-3"),
        dbc.Table.from_dataframe(result.cost_by_carrier_display, striped=True, bordered=True, hover=True, responsive=True, className="mb-5"),
        html.H3("Cost by Source File", className="mt-4 mb-3"),
        dbc.Table.from_dataframe(result.cost_by_file_display, striped=True, bordered=True, hover=True, responsive=True, className="mb-5"),
        html.H3("Monthly Totals", className="mt-4 mb-3"),
        dbc.Table.from_dataframe(result.monthly_display_table, striped=True, bordered=True, hover=True, responsive=True, className="mb-5"),
        html.H3("Invoice Totals", className="mt-4 mb-3"),
        dbc.Table.from_dataframe(result.invoice_display_table, striped=True, bordered=True, hover=True, responsive=True, className="mb-5"),
        html.H3("Unmapped Charges (top)", className="mt-4 mb-3"),
        dbc.Table.from_dataframe(result.unmapped_table.head(50), striped=True, bordered=True, hover=True, responsive=True, className="mb-4"),
    ], fluid=True)

    return app
