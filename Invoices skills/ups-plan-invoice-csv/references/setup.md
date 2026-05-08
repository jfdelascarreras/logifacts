# Setup

## Install dependencies

Use Python 3.10+.

```bash
pip install -r requirements.txt
python -m playwright install chromium
```

## Credentials

Set credentials as environment variables. Do not put them in `SKILL.md`, scripts, screenshots, or git.

```bash
export UPS_USERNAME='your_username'
export UPS_PASSWORD='your_password'
```

On Windows PowerShell:

```powershell
$env:UPS_USERNAME='your_username'
$env:UPS_PASSWORD='your_password'
```

## First run

Run with a visible browser so you can handle any UPS verification challenge.

```bash
python scripts/download_ups_plan_invoices.py --headful --output ./ups_downloads --storage-state ups_state.json
```

After a successful run, reuse the same storage state:

```bash
python scripts/download_ups_plan_invoices.py --output ./ups_downloads --storage-state ups_state.json
```

## Notes

UPS may change labels or require MFA/CAPTCHA. The script does not bypass those checks; complete them manually when prompted.
