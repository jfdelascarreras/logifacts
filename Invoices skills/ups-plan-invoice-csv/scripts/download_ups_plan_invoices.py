#!/usr/bin/env python3
"""Download UPS Billing Center My Plan Invoices CSV exports.

Credentials are read from UPS_USERNAME and UPS_PASSWORD. The script never stores
credentials. For MFA/CAPTCHA, run with --headful and complete the challenge in
the browser window.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from pathlib import Path
from typing import Iterable, Optional

from playwright.sync_api import BrowserContext, Error, Page, TimeoutError, sync_playwright

UPS_HOME = "https://www.ups.com/us/undefined/home"


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def first_visible(page: Page, selectors: Iterable[str], timeout: int = 2500):
    last_error: Optional[Exception] = None
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            locator.wait_for(state="visible", timeout=timeout)
            return locator
        except Exception as exc:  # noqa: BLE001 - keep trying fallbacks
            last_error = exc
    if last_error:
        raise last_error
    raise RuntimeError("no selectors supplied")


def click_first(page: Page, selectors: Iterable[str], label: str, timeout: int = 4000) -> bool:
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            locator.wait_for(state="visible", timeout=timeout)
            locator.click(timeout=timeout)
            log(f"Clicked {label}")
            return True
        except Exception:
            continue
    return False


def newest_page(context: BrowserContext, current: Page) -> Page:
    pages = context.pages
    return pages[-1] if pages else current


def maybe_login(page: Page, username: Optional[str], password: Optional[str], wait_seconds: int) -> None:
    """Sign in if login controls are visible. Otherwise assume already signed in."""
    login_clicked = click_first(
        page,
        [
            "role=button[name=/log in|sign in/i]",
            "role=link[name=/log in|sign in/i]",
            "text=/Log In|Sign In/i",
        ],
        "Log In",
        timeout=3000,
    )

    if not login_clicked:
        log("No login button found; assuming session is already authenticated")
        return

    if not username or not password:
        raise RuntimeError("UPS_USERNAME and UPS_PASSWORD are required when not already logged in")

    # UPS sign-in screens have changed over time; use broad fallbacks.
    user_selectors = [
        "input[name='userID']",
        "input[name='username']",
        "input[name='email']",
        "input[type='email']",
        "input[autocomplete='username']",
        "input:near(:text('Username'))",
    ]
    password_selectors = [
        "input[name='password']",
        "input[type='password']",
        "input[autocomplete='current-password']",
    ]

    user_field = first_visible(page, user_selectors, timeout=15000)
    user_field.fill(username)
    log("Filled username")

    # Some UPS forms require clicking Continue before the password appears.
    click_first(page, ["role=button[name=/continue|next/i]", "text=/Continue|Next/i"], "Continue", timeout=2500)

    pass_field = first_visible(page, password_selectors, timeout=15000)
    pass_field.fill(password)
    log("Filled password")

    if not click_first(
        page,
        ["role=button[name=/sign in|log in/i]", "button[type='submit']", "text=/Sign In|Log In/i"],
        "Sign In",
        timeout=5000,
    ):
        raise RuntimeError("could not find the final sign-in button")

    try:
        page.wait_for_load_state("networkidle", timeout=30000)
    except TimeoutError:
        pass

    if re.search(r"verify|verification|captcha|security|code", page.content(), re.I):
        log(f"UPS may require manual verification. Waiting up to {wait_seconds} seconds.")
        page.wait_for_timeout(wait_seconds * 1000)


def open_pay_bill(page: Page, context: BrowserContext) -> Page:
    # Open account menu via the blue account circle/avatar in top right.
    if not click_first(
        page,
        [
            "button[aria-label*='Account' i]",
            "button:has-text('C')",
            "[class*='profile'] button",
            "xpath=(//button[contains(@class,'ups') or contains(@aria-label,'Account') or .//span])[last()]",
        ],
        "account menu",
        timeout=6000,
    ):
        # Fallback: clicking Pay Bill directly may be possible from page content.
        log("Could not identify avatar button; trying Pay Bill directly")

    initial_pages = len(context.pages)
    clicked = click_first(
        page,
        ["text=/Pay Bill/i", "role=link[name=/Pay Bill/i]", "role=button[name=/Pay Bill/i]"],
        "Pay Bill",
        timeout=6000,
    )
    if not clicked:
        raise RuntimeError("could not click Pay Bill from the account menu")

    # UPS may open Pay Bill in a new tab or navigate the current tab.
    deadline = time.monotonic() + 20.0
    while time.monotonic() < deadline:
        if len(context.pages) > initial_pages:
            new_page = context.pages[-1]
            try:
                new_page.wait_for_load_state("domcontentloaded", timeout=15000)
            except TimeoutError:
                pass
            return new_page
        try:
            page.wait_for_load_state("domcontentloaded", timeout=2000)
        except TimeoutError:
            pass
        # Same-tab navigation often lands on billing/payment URLs.
        url_lower = page.url.lower()
        if any(k in url_lower for k in ("billing", "payment", "invoice", "billcenter", "paybill")):
            return page
        page.wait_for_timeout(400)

    log("Pay Bill did not open a new tab; continuing on the active page")
    return page


def open_billing_center(page: Page, context: BrowserContext) -> Page:
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except TimeoutError:
        pass
    initial_pages = len(context.pages)
    clicked = click_first(
        page,
        [
            "text=/Go to Billing Center/i",
            "role=link[name=/Go to Billing Center/i]",
            "role=button[name=/Go to Billing Center/i]",
            "text=/Billing Center/i",
        ],
        "Go to Billing Center",
        timeout=15000,
    )
    if not clicked:
        raise RuntimeError("could not open Billing Center")

    deadline = time.monotonic() + 25.0
    while time.monotonic() < deadline:
        if len(context.pages) > initial_pages:
            new_page = context.pages[-1]
            try:
                new_page.wait_for_load_state("domcontentloaded", timeout=20000)
            except TimeoutError:
                pass
            return new_page
        try:
            page.wait_for_load_state("domcontentloaded", timeout=2000)
        except TimeoutError:
            pass
        url_lower = page.url.lower()
        if any(k in url_lower for k in ("billing", "billcenter", "invoice")):
            return page
        page.wait_for_timeout(400)

    log("Billing Center did not open a new tab; continuing on the active page")
    return page


def open_plan_invoices(page: Page) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=20000)
    except TimeoutError:
        pass
    if not click_first(
        page,
        [
            "text=/My Plan Invoices/i",
            "role=link[name=/My Plan Invoices/i]",
            "a:has-text('My Plan Invoices')",
        ],
        "My Plan Invoices",
        timeout=20000,
    ):
        raise RuntimeError("could not find My Plan Invoices")
    try:
        page.wait_for_load_state("networkidle", timeout=20000)
    except TimeoutError:
        pass


def safe_filename(name: str, default_prefix: str = "ups_plan_invoice") -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._-")
    if not cleaned:
        cleaned = f"{default_prefix}_{int(time.time())}.csv"
    if not cleaned.lower().endswith(".csv"):
        cleaned += ".csv"
    return cleaned


def download_csvs(page: Page, output_dir: Path, max_rows: Optional[int]) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    downloaded: list[Path] = []

    page.wait_for_selector("table", timeout=30000)
    rows = page.locator("table tbody tr")
    count = rows.count()
    if max_rows is not None:
        count = min(count, max_rows)
    log(f"Found {count} invoice row(s) to process")

    for index in range(count):
        row = rows.nth(index)
        try:
            row.scroll_into_view_if_needed(timeout=5000)
            row_text = re.sub(r"\s+", " ", row.inner_text(timeout=5000)).strip()
            log(f"Processing row {index + 1}: {row_text[:120]}")

            # Prefer the three-dot Actions menu; use the row PDF icon only if CSV is unavailable.
            action_candidates = [
                row.locator("button[aria-label*='Action' i]").last,
                row.locator("button:has-text('⋮')").last,
                row.locator("button").last,
                row.locator("[role='button']").last,
            ]
            clicked_menu = False
            for candidate in action_candidates:
                try:
                    candidate.click(timeout=5000)
                    clicked_menu = True
                    break
                except Exception:
                    continue
            if not clicked_menu:
                log(f"Skipping row {index + 1}: no actions menu found")
                continue

            csv_item = page.locator("text=/Download CSV/i").last
            csv_item.wait_for(state="visible", timeout=8000)
            with page.expect_download(timeout=30000) as download_info:
                csv_item.click(timeout=8000)
            download = download_info.value
            suggested = safe_filename(download.suggested_filename or f"ups_plan_invoice_row_{index + 1}.csv")
            target = output_dir / suggested
            if target.exists():
                target = output_dir / f"{target.stem}_{int(time.time())}{target.suffix}"
            download.save_as(target)
            downloaded.append(target)
            log(f"Saved {target}")
        except Exception as exc:  # noqa: BLE001 - keep processing other rows
            log(f"Failed row {index + 1}: {exc}")
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
    return downloaded


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download UPS My Plan Invoices CSV files")
    parser.add_argument("--output", default="ups_downloads", help="directory for downloaded CSV files")
    parser.add_argument("--headful", action="store_true", help="show the browser window")
    parser.add_argument("--max-rows", type=int, default=None, help="maximum invoice rows to download")
    parser.add_argument("--storage-state", default=None, help="path to reuse/save Playwright login state JSON")
    parser.add_argument("--headed-wait-seconds", type=int, default=120, help="manual verification wait time")
    parser.add_argument("--slow-mo", type=int, default=0, help="Playwright slow motion in milliseconds")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    username = os.getenv("UPS_USERNAME")
    password = os.getenv("UPS_PASSWORD")
    output_dir = Path(args.output).resolve()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headful, slow_mo=args.slow_mo)
        context_kwargs = {"accept_downloads": True}
        if args.storage_state and Path(args.storage_state).exists():
            context_kwargs["storage_state"] = args.storage_state
        context = browser.new_context(**context_kwargs)
        page = context.new_page()

        try:
            log(f"Opening {UPS_HOME}")
            page.goto(UPS_HOME, wait_until="domcontentloaded", timeout=60000)
            maybe_login(page, username, password, args.headed_wait_seconds)
            page = open_pay_bill(page, context)
            page = open_billing_center(page, context)
            open_plan_invoices(page)
            downloaded = download_csvs(page, output_dir, args.max_rows)
            if args.storage_state:
                context.storage_state(path=args.storage_state)
            log("Done")
            print("\nDownloaded CSV files:")
            for path in downloaded:
                print(f"- {path}")
            if not downloaded:
                print("- none")
            return 0 if downloaded else 2
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Error as exc:
        print(f"Playwright error: {exc}", file=sys.stderr)
        raise SystemExit(1)
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
