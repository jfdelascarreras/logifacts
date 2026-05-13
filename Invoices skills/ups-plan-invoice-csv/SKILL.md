---
name: ups-plan-invoice-csv
description: automate downloading ups billing center plan invoice csv files from a logged-in ups account. use when the user asks to retrieve ups plan invoices, navigate the ups billing center, use the pay bill path, open my plan invoices, or download invoice csv exports. this skill uses a bundled playwright script and requires credentials through environment variables or an existing browser session; never store credentials in the skill.
---

# UPS Plan Invoice CSV

## Overview

Use this skill to automate the UPS workflow shown in the provided screenshots: sign in to UPS, open the account menu, choose Pay Bill, open the Billing Center, go to My Plan Invoices, and download CSV files from the invoice actions menu.

This skill is for authorized access to the user's own UPS account only.

## Safety and credential rules

- Never hardcode credentials in files, prompts, screenshots, logs, or generated code.
- Read credentials only from environment variables: `UPS_USERNAME` and `UPS_PASSWORD`.
- If UPS requires MFA, SSO, CAPTCHA, or extra verification, pause and let the user complete it in the opened browser window.
- Do not bypass CAPTCHA, MFA, rate limits, or access controls.
- Respect UPS terms and use this only for accounts the user is authorized to access.

## Default workflow

1. Confirm the user wants UPS Plan Invoice CSV downloads.
2. Use `scripts/download_ups_plan_invoices.py` unless the user asks for only instructions.
3. Ensure Playwright dependencies are installed. See `references/setup.md`.
4. Run the script with a visible browser first:

```bash
python scripts/download_ups_plan_invoices.py --headful --output ./ups_downloads
```

5. The script navigates this path:
   - open `https://www.ups.com/us/undefined/home`
   - sign in if needed using `UPS_USERNAME` and `UPS_PASSWORD`
   - click the blue account circle in the top right
   - click `Pay Bill`
   - click `Go to Billing Center`
   - click `My Plan Invoices`
   - for invoice rows, open the three-dot actions menu and choose `Download CSV (250 Columns)`
6. Report which CSV files were downloaded and any rows that failed.

## Script behavior

The script uses semantic locators first, then fallback selectors/text based on the screenshots. It downloads CSV, not PDF. It saves downloads to the output directory and renames unknown downloads with a timestamp if UPS does not provide a useful filename.

Useful options:

```bash
python scripts/download_ups_plan_invoices.py --help
python scripts/download_ups_plan_invoices.py --headful --max-rows 5
python scripts/download_ups_plan_invoices.py --headed-wait-seconds 120
python scripts/download_ups_plan_invoices.py --storage-state ups_state.json
```

Use `--storage-state ups_state.json` to reuse a logged-in session after the first successful login.

## Troubleshooting

- If the UPS page shows `Sorry! We Can't Find That Page`, still attempt sign-in from the header, then use the account menu path.
- If the Billing Center opens in a new tab, continue in the newest page.
- If buttons change labels, search for nearby text shown in the screenshots: `Pay Bill`, `Billing Center`, `My Plan Invoices`, `Download CSV`, and `250 Columns`.
- If the page has a filter dropdown labelled `All Available`, leave it unchanged unless the user requests a date/status filter.
- If downloads fail because of pop-up blocking or navigation, rerun in headful mode and inspect screenshots saved by Playwright tracing if enabled.

## Outputs

Return a compact summary:

```text
Downloaded CSV files:
- path/to/file1.csv
- path/to/file2.csv

Skipped/failed rows:
- row description and reason
```
