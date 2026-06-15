"""HTML report export — aligned with AgentsFindingsPanel + AGENTS Invoices.md."""

from __future__ import annotations

import html
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from .utils import fmt_money, safe_pct


def _esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""))


def _fmt_usd(n: float) -> str:
    return f"${n:,.2f}"


def _format_cost_by_file(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    out = df.copy()
    if "totalCost" in out.columns:
        out["Total Cost"] = out["totalCost"].apply(lambda x: _fmt_usd(float(x)))
        out["Rows"] = out["rowCount"].apply(lambda x: f"{int(x):,}")
        cols = [c for c in ["Source File", "Total Cost", "Rows"] if c in out.columns]
        return out[cols]
    return out


def _df_to_html_table(df: pd.DataFrame, *, max_rows: int | None = None) -> str:
    if df.empty:
        return '<p class="muted">No data</p>'
    view = df.head(max_rows) if max_rows else df
    headers = "".join(f"<th>{_esc(c)}</th>" for c in view.columns)
    rows = []
    for _, row in view.iterrows():
        cells = "".join(f"<td>{_esc(row[c])}</td>" for c in view.columns)
        rows.append(f"<tr>{cells}</tr>")
    body = "\n".join(rows)
    note = ""
    if max_rows and len(df) > max_rows:
        note = f'<p class="muted">Showing first {max_rows:,} of {len(df):,} rows.</p>'
    return f"{note}<table><thead><tr>{headers}</tr></thead><tbody>{body}</tbody></table>"


def _kpi_card(label: str, value: str, sub: str = "") -> str:
    sub_html = f'<div class="kpi-sub">{_esc(sub)}</div>' if sub else ""
    return f"""
    <div class="kpi-card">
      <div class="kpi-label">{_esc(label)}</div>
      <div class="kpi-value">{_esc(value)}</div>
      {sub_html}
    </div>"""


def _render_spec_categories(spec: dict[str, Any] | None, dataset: dict[str, Any] | None) -> str:
    if not spec or not spec.get("categories"):
        return ""
    rows = "".join(
        f"<tr><td>{_esc(c['category'].replace('_', ' '))}</td>"
        f"<td class='num'>{_esc(_fmt_usd(float(c['totalCost'])))}</td>"
        f"<td class='num'>{float(c['pctOfTotal']) * 100:.1f}%</td></tr>"
        for c in spec["categories"]
    )
    warn = ""
    if dataset and dataset.get("accessorialRateHigh"):
        rate = float(dataset.get("accessorialRate") or 0)
        warn = (
            f'<p class="warn">Accessorial rate {rate * 100:.1f}% exceeds 10% benchmark (normal 5–8%).</p>'
        )
    return f"""
    <section>
      <h2>Cost structure</h2>
      <p class="section-desc">Spend by AGENTS category — same view as the app <em>Cost structure</em> card.</p>
      <table>
        <thead><tr><th>Category</th><th class="num">Amount</th><th class="num">% of total</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
      {warn}
    </section>"""


def _render_carrier_mix(mix: list[dict[str, Any]] | None) -> str:
    if not mix:
        return ""
    rows = "".join(
        f"<tr><td>{_esc(r.get('carrier'))}</td><td>{_esc(r.get('service'))}</td>"
        f"<td>{_esc(r.get('zoneMode'))}</td>"
        f"<td class='num'>{int(r.get('shipmentCount') or 0):,}</td>"
        f"<td class='num'>{_esc(_fmt_usd(float(r.get('totalCost') or 0)))}</td>"
        f"<td class='num'>{_esc(_fmt_usd(float(r.get('avgCostPerShipment') or 0)))}</td></tr>"
        for r in mix[:15]
    )
    return f"""
    <section>
      <h2>Carrier mix</h2>
      <p class="section-desc">Shipments and average cost by service and zone mode (shipment grain).</p>
      <table>
        <thead><tr><th>Carrier</th><th>Service</th><th>Zone mode</th><th class="num">Shipments</th><th class="num">Total</th><th class="num">Avg / shipment</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </section>"""


def _render_savings_and_actions(
    savings: dict[str, Any] | None,
    actions: list[dict[str, Any]],
    quality: dict[str, Any],
) -> str:
    if quality.get("blockSavings"):
        return f"""
    <section class="warn-box">
      <h2>Annualized savings opportunity</h2>
      <p class="warn">Savings estimates are hidden: {_esc(quality.get('reason') or 'Ingest quality gate.')}</p>
    </section>"""
    if not savings:
        return ""
    months = savings.get("annualizedBasisMonths", 1)
    quick = ""
    if actions:
        a0 = actions[0]
        quick = (
            f'<div class="callout"><strong>Quick win:</strong> #{a0.get("rank")} {_esc(a0.get("category"))} '
            f"— up to {_esc(_fmt_usd(float(a0.get('annualSavingsHigh') or 0)))}/yr</div>"
        )
    opp_rows = ""
    for opp in savings.get("opportunities") or []:
        opp_rows += (
            f"<tr><td>{_esc(str(opp.get('type', '')).replace('_', ' '))}</td>"
            f"<td class='num'>{_esc(_fmt_usd(float(opp.get('periodAmount') or 0)))}</td>"
            f"<td class='num'>{_esc(_fmt_usd(float(opp.get('annualizedLow') or 0)))}</td>"
            f"<td class='num'>{_esc(_fmt_usd(float(opp.get('annualizedHigh') or 0)))}</td></tr>"
        )
    opps_table = ""
    if opp_rows:
        opps_table = f"""
      <table>
        <thead><tr><th>Opportunity</th><th class="num">Period</th><th class="num">Annual low</th><th class="num">Annual high</th></tr></thead>
        <tbody>{opp_rows}</tbody>
      </table>"""
    return f"""
    <section class="savings-box">
      <h2>Annualized savings opportunity</h2>
      <p class="lead">{_esc(_fmt_usd(float(savings.get('low') or 0)))} – {_esc(_fmt_usd(float(savings.get('high') or 0)))} <span class="muted">per year</span></p>
      <p class="section-desc">Based on {months} month(s) in dataset — recoverable spend if findings are addressed.</p>
      {quick}
      {opps_table}
    </section>"""


def _render_actions(actions: list[dict[str, Any]], quality: dict[str, Any]) -> str:
    if quality.get("blockSavings") or not actions:
        return ""
    cards = []
    for a in actions[:8]:
        executable = a.get("executable")
        cls = "action-card action-card--highlight" if executable else "action-card"
        badge = '<span class="badge badge--start">Start here</span>' if executable else ""
        cards.append(
            f'<div class="{cls}">'
            f'<div class="action-head"><strong>#{a.get("rank")} {_esc(a.get("category"))}</strong> {badge}'
            f'<span class="badge">{_esc(a.get("effort"))} effort</span>'
            f'<span class="muted">{_esc(_fmt_usd(float(a.get("annualSavingsLow") or 0)))} – '
            f'{_esc(_fmt_usd(float(a.get("annualSavingsHigh") or 0)))} / yr</span></div>'
            f'<p class="action-body">{_esc(a.get("instructions"))}</p></div>'
        )
    return f"""
    <section>
      <h2>Prioritized actions</h2>
      <p class="section-desc">Ranked by savings impact and effort — top 3 marked <em>Start here</em> (matches app).</p>
      {"".join(cards)}
    </section>"""


def _render_flags(flags: list[dict[str, Any]]) -> str:
    if not flags:
        return ""
    rows = "".join(
        f"<tr><td>{_esc(str(f.get('type', '')).replace('_', ' '))}</td>"
        f"<td>{_esc(f.get('trackingNumber') or '—')}</td>"
        f"<td class='num'>{_esc(_fmt_usd(float(f.get('amount') or 0)))}</td>"
        f"<td>{_esc(f.get('description'))}</td></tr>"
        for f in flags[:50]
    )
    return f"""
    <section>
      <h2>Anomaly flags</h2>
      <p class="section-desc">{len(flags)} item(s) flagged against AGENTS universal checks.</p>
      <table>
        <thead><tr><th>Type</th><th>Tracking</th><th class="num">Amount</th><th>Description</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </section>"""


def _render_spend_summary(
    summary: dict[str, Any],
    tables: dict[str, pd.DataFrame],
    m: dict[str, Any],
    total_cost: float,
) -> str:
    non_fuel_surcharges = max(0.0, float(m.get("costSurcharges") or 0) - float(m.get("fuelCost") or 0))
    by_carrier_rows = ""
    for carrier, vals in (summary.get("byCarrier") or {}).items():
        by_carrier_rows += (
            f"<tr><td>{_esc(carrier)}</td>"
            f"<td class='num'>{_esc(_fmt_usd(float(vals.get('totalNetAmount') or 0)))}</td>"
            f"<td class='num'>{int(vals.get('chargeLineCount') or 0):,}</td>"
            f"<td class='num'>{int(vals.get('shipmentCount') or 0):,}</td></tr>"
        )
    carrier_table = ""
    if by_carrier_rows:
        carrier_table = f"""
      <h3>By carrier</h3>
      <table>
        <thead><tr><th>Carrier</th><th class="num">Total cost</th><th class="num">Charge lines</th><th class="num">Shipments</th></tr></thead>
        <tbody>{by_carrier_rows}</tbody>
      </table>"""

    return f"""
    <section>
      <h2>Total spend summary</h2>
      <p class="section-desc">Output #1 — monthly trend, invoices, and legacy KPI buckets.</p>
      <table class="kpi-legend">
        <thead><tr><th>KPI bucket</th><th class="num">Amount</th><th>Notes</th></tr></thead>
        <tbody>
          <tr><td>Total cost (Net Amount)</td><td class="num">{_esc(_fmt_usd(total_cost))}</td><td>All charge lines</td></tr>
          <tr><td>Fuel (category_3 = FUEL SURCHARGE)</td><td class="num">{_esc(_fmt_usd(float(m.get('fuelCost') or 0)))}</td><td>Subset of surcharges below</td></tr>
          <tr><td>Surcharges (fuel + other cat_3 surcharges)</td><td class="num">{_esc(_fmt_usd(float(m.get('costSurcharges') or 0)))}</td><td>Non-fuel portion: {_esc(_fmt_usd(non_fuel_surcharges))}</td></tr>
          <tr><td>Accessorials</td><td class="num">{_esc(_fmt_usd(float(m.get('costAccessorials') or 0)))}</td><td>ACC classification / accessorial taxonomy</td></tr>
          <tr><td>Weight gap</td><td class="num">{float(m.get('weightGap') or 0):,.0f} lbs</td><td>Output #5 — shipment grain</td></tr>
        </tbody>
      </table>
      <h3>Monthly spend</h3>
      {_df_to_html_table(tables.get("monthly_display", pd.DataFrame()))}
      <h3>Cost by source file</h3>
      {_df_to_html_table(_format_cost_by_file(tables.get("cost_by_file", pd.DataFrame())))}
      {carrier_table}
      <h3>Invoice totals</h3>
      {_df_to_html_table(tables.get("invoice_display", pd.DataFrame()), max_rows=100)}
    </section>"""


def export_html_report(
    summary: dict[str, Any],
    tables: dict[str, pd.DataFrame],
    file_structure_df: pd.DataFrame,
    unmapped_df: pd.DataFrame,
    ingest_diag: dict[str, Any],
    *,
    input_label: str,
    output_path: Path,
    row_count: int,
) -> Path:
    m = summary["measures"]
    total_cost = float(m["totalCost"])
    savings = summary.get("savingsEstimate")
    actions = summary.get("actionItems") or []
    flags = summary.get("anomalyFlags") or []
    quality = summary.get("ingestQuality") or {}
    stale = summary.get("staleIngest") or {}
    dataset = summary.get("datasetFlags") or {}
    spec = summary.get("specCategories")
    mix = summary.get("carrierMix")
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    top_flag = flags[0] if flags else None
    exec_flags = f"{len(flags)} anomaly flag(s)" if flags else "no anomalies flagged"
    savings_line = ""
    if savings and not quality.get("blockSavings"):
        savings_line = (
            f" · Estimated savings {_fmt_usd(float(savings.get('low') or 0))}–"
            f"{_fmt_usd(float(savings.get('high') or 0))}/yr"
        )

    kpi_grid = "".join(
        [
            _kpi_card("Total cost", _fmt_usd(total_cost)),
            _kpi_card("Shipments", f"{m['packageDedupeShipmentCount']:,}"),
            _kpi_card("Weight gap", f"{m['weightGap']:,.0f} lbs", "shipment grain"),
            _kpi_card("Mapped lines", f"{ingest_diag.get('linesMapped', 0):,}", f"of {ingest_diag.get('linesTotal', row_count):,}"),
        ]
    )

    wwe_notice = ""
    if dataset.get("wwePresent") and dataset.get("wweFuelEmbedded"):
        wwe_notice = (
            '<p class="notice">WWE/WWEX: fuel surcharge is embedded in base rates and cannot be '
            "verified as a separate line item.</p>"
        )

    stale_html = ""
    if stale.get("needsReupload"):
        items = "".join(f"<li>{_esc(r)}</li>" for r in stale.get("reasons") or [])
        stale_html = f'<section class="warn-box"><h2>Ingest warnings</h2><ul>{items}</ul></section>'

    ingest_lines = [
        ("Files loaded", ingest_diag.get("filesLoaded", 0)),
        ("Mapped lines", f"{ingest_diag.get('linesMapped', 0):,} / {ingest_diag.get('linesTotal', row_count):,}"),
        ("Unmapped spend", _fmt_usd(float(ingest_diag.get("unmappedSpend") or 0))),
        ("Shipments", f"{ingest_diag.get('shipmentsTotal', 0):,}"),
        ("Parse versions", ", ".join(ingest_diag.get("parseVersions") or []) or "(none)"),
    ]
    ingest_html = "<ul>" + "".join(f"<li><strong>{_esc(k)}:</strong> {_esc(v)}</li>" for k, v in ingest_lines) + "</ul>"

    doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LogiFacts Premium Analysis — Findings Report</title>
  <style>
    :root {{
      --bg: #f8fafc; --card: #fff; --text: #0f172a; --muted: #64748b;
      --border: #e2e8f0; --warn: #b45309; --warn-bg: #fffbeb;
      --ok: #047857; --ok-bg: #ecfdf5; --ok-border: #6ee7b7;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }}
    .wrap {{ max-width: 1100px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }}
    h1 {{ font-size: 1.75rem; margin: 0 0 0.25rem; }}
    h2 {{ font-size: 1.15rem; margin: 0 0 0.5rem; }}
    h3 {{ font-size: 0.95rem; margin: 1.25rem 0 0.5rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }}
    .meta {{ color: var(--muted); font-size: 0.9rem; margin-bottom: 1rem; }}
    .exec {{ background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1rem; }}
    .kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }}
    .kpi-card {{ background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 1rem; }}
    .kpi-label {{ font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }}
    .kpi-value {{ font-size: 1.25rem; font-weight: 700; margin-top: 0.2rem; }}
    .kpi-sub {{ font-size: 0.75rem; color: var(--muted); margin-top: 0.15rem; }}
    section {{ background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 1.25rem; margin-bottom: 1rem; }}
    .section-desc {{ color: var(--muted); font-size: 0.88rem; margin: 0 0 0.75rem; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.88rem; margin-bottom: 0.5rem; }}
    th, td {{ border-bottom: 1px solid var(--border); padding: 0.45rem 0.55rem; text-align: left; vertical-align: top; }}
    th {{ background: #f1f5f9; font-weight: 600; }}
    td.num, th.num {{ text-align: right; }}
    tr:hover td {{ background: #f8fafc; }}
    .muted {{ color: var(--muted); font-size: 0.85rem; }}
    .lead {{ font-size: 1.25rem; font-weight: 700; color: var(--ok); margin: 0.25rem 0; }}
    .warn {{ color: var(--warn); font-size: 0.88rem; }}
    .notice {{ background: var(--warn-bg); border: 1px solid #fcd34d; border-radius: 8px; padding: 0.65rem 0.85rem; font-size: 0.88rem; margin-bottom: 1rem; }}
    .warn-box {{ background: var(--warn-bg); border-color: #fcd34d; }}
    .savings-box {{ background: var(--ok-bg); border-color: var(--ok-border); }}
    .callout {{ margin-top: 0.75rem; padding: 0.65rem 0.85rem; background: #fff; border: 1px solid var(--ok-border); border-radius: 8px; font-size: 0.88rem; }}
    .action-card {{ border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem; }}
    .action-card--highlight {{ border-color: var(--ok-border); background: var(--ok-bg); }}
    .action-head {{ display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; font-size: 0.9rem; }}
    .action-body {{ margin: 0.35rem 0 0; font-size: 0.88rem; color: var(--muted); }}
    .badge {{ display: inline-block; font-size: 0.7rem; padding: 0.1rem 0.45rem; border-radius: 4px; background: #e2e8f0; }}
    .badge--start {{ background: #d1fae5; color: #065f46; }}
    footer {{ margin-top: 2rem; color: var(--muted); font-size: 0.8rem; }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Premium Analysis — Findings Report</h1>
    <p class="meta">Offline mirror · aligned with app AgentsFindingsPanel<br>
      Source: {_esc(input_label)}<br>
      Generated: {_esc(generated)} · {row_count:,} charge lines</p>

    <div class="exec">
      <strong>Executive summary</strong>
      <p class="section-desc" style="margin-top:0.35rem">
        Total spend {_esc(_fmt_usd(total_cost))} across {m['packageDedupeShipmentCount']:,} shipments.
        {exec_flags}{savings_line}.
        {f" Top issue: {_esc(top_flag.get('description'))}." if top_flag else ""}
      </p>
    </div>

    {wwe_notice}
    {stale_html}

    <div class="kpi-grid">{kpi_grid}</div>

    {_render_spec_categories(spec, dataset)}
    {_render_carrier_mix(mix)}
    {_render_savings_and_actions(savings, actions, quality)}
    {_render_actions(actions, quality)}
    {_render_flags(flags)}
    {_render_spend_summary(summary, tables, m, total_cost)}

    <section>
      <h2>Data quality</h2>
      {ingest_html}
      {_df_to_html_table(tables.get("diagnostics", pd.DataFrame()))}
      <h3>Unmapped charges</h3>
      {_df_to_html_table(unmapped_df, max_rows=50)}
      <h3>Files ingested</h3>
      {_df_to_html_table(file_structure_df)}
    </section>

    <footer>LogiFacts offline mirror · structure matches AGENTS Invoices.md + AgentsFindingsPanel</footer>
  </div>
</body>
</html>"""

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(doc, encoding="utf-8")
    return output_path
