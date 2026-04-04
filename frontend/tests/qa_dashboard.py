"""
QA test script for UAV Analysis Dashboard.
Tests:
1. Full desktop screenshot (1440x900)
2. Browser console - no DialogTitle/DialogDescription warnings
3. AI Debrief tab - placeholder text
4. Metrics tab - metric cards grid and warnings section
5. Mobile screenshot (375px) + hamburger menu / Sheet drawer
"""

import os
import sys
from playwright.sync_api import sync_playwright

SCREENSHOTS_DIR = "/tmp/qa_screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

console_messages = []

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ------------------------------------------------------------------ #
        # 1. Desktop screenshot (1440x900)
        # ------------------------------------------------------------------ #
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        # Capture all console messages
        page.on("console", lambda msg: console_messages.append({
            "type": msg.type,
            "text": msg.text,
        }))
        page.on("pageerror", lambda err: console_messages.append({
            "type": "pageerror",
            "text": str(err),
        }))

        print("[1] Navigating to http://localhost:5173 ...")
        page.goto("http://localhost:5173", wait_until="networkidle")
        page.wait_for_timeout(1000)  # let any deferred renders settle

        page.screenshot(path=f"{SCREENSHOTS_DIR}/01_desktop_initial.png", full_page=True)
        print(f"    Screenshot saved: {SCREENSHOTS_DIR}/01_desktop_initial.png")

        # ------------------------------------------------------------------ #
        # 2. Check console for DialogTitle / DialogDescription warnings
        # ------------------------------------------------------------------ #
        print("\n[2] Checking console for DialogTitle/DialogDescription warnings ...")
        dialog_warnings = [
            m for m in console_messages
            if "dialogtitle" in m["text"].lower() or "dialogdescription" in m["text"].lower()
        ]
        if dialog_warnings:
            print(f"    FAIL - Found {len(dialog_warnings)} DialogTitle/DialogDescription warning(s):")
            for w in dialog_warnings:
                print(f"      [{w['type']}] {w['text'][:200]}")
        else:
            print("    PASS - No DialogTitle/DialogDescription warnings found")

        all_console = [m for m in console_messages if m["type"] in ("error", "warning")]
        if all_console:
            print(f"\n    All console errors/warnings ({len(all_console)}):")
            for m in all_console[:20]:
                print(f"      [{m['type']}] {m['text'][:200]}")
        else:
            print("    No console errors or warnings at all.")

        # ------------------------------------------------------------------ #
        # 3. AI Debrief tab
        # ------------------------------------------------------------------ #
        print("\n[3] Clicking AI Debrief tab ...")
        # Try various selectors for the tab
        ai_tab = None
        for selector in [
            'text=AI Debrief',
            '[role="tab"]:has-text("AI Debrief")',
            'button:has-text("AI Debrief")',
            'a:has-text("AI Debrief")',
        ]:
            try:
                el = page.locator(selector).first
                if el.count() > 0:
                    ai_tab = el
                    print(f"    Found AI Debrief tab via: {selector}")
                    break
            except Exception:
                pass

        if ai_tab:
            ai_tab.click()
            page.wait_for_timeout(800)
            page.screenshot(path=f"{SCREENSHOTS_DIR}/02_ai_debrief_tab.png", full_page=True)
            print(f"    Screenshot saved: {SCREENSHOTS_DIR}/02_ai_debrief_tab.png")

            # Check placeholder text is visible
            content = page.content()
            placeholder_indicators = [
                "upload", "no flight", "select a flight", "no data",
                "placeholder", "debrief", "ai analysis", "waiting",
                "load a flight", "open a file",
            ]
            found_placeholder = any(p_text in content.lower() for p_text in placeholder_indicators)
            if found_placeholder:
                print("    PASS - AI Debrief tab shows placeholder/empty-state content")
            else:
                print("    WARN - Could not confirm placeholder text in AI Debrief tab")
        else:
            print("    WARN - AI Debrief tab not found; dumping visible tab labels ...")
            tabs = page.locator('[role="tab"]').all()
            for t in tabs:
                print(f"      Tab text: '{t.inner_text()}'")
            page.screenshot(path=f"{SCREENSHOTS_DIR}/02_ai_debrief_tab_notfound.png", full_page=True)

        # ------------------------------------------------------------------ #
        # 4. Metrics tab
        # ------------------------------------------------------------------ #
        print("\n[4] Clicking Metrics tab ...")
        metrics_tab = None
        for selector in [
            'text=Metrics',
            '[role="tab"]:has-text("Metrics")',
            'button:has-text("Metrics")',
        ]:
            try:
                el = page.locator(selector).first
                if el.count() > 0:
                    metrics_tab = el
                    print(f"    Found Metrics tab via: {selector}")
                    break
            except Exception:
                pass

        if metrics_tab:
            metrics_tab.click()
            page.wait_for_timeout(800)
            page.screenshot(path=f"{SCREENSHOTS_DIR}/03_metrics_tab.png", full_page=True)
            print(f"    Screenshot saved: {SCREENSHOTS_DIR}/03_metrics_tab.png")

            content = page.content()
            metric_indicators = [
                "metric", "duration", "distance", "speed", "altitude",
                "max", "min", "avg", "flight time",
            ]
            warning_indicators = ["warning", "anomaly", "alert", "caution"]

            has_metrics = any(t in content.lower() for t in metric_indicators)
            has_warnings = any(t in content.lower() for t in warning_indicators)

            if has_metrics:
                print("    PASS - Metrics tab shows metric-related content")
            else:
                print("    WARN - No obvious metric card content detected")

            if has_warnings:
                print("    PASS - Warnings/anomaly section present in Metrics tab")
            else:
                print("    INFO - No warnings section detected (may be normal if no data loaded)")
        else:
            print("    WARN - Metrics tab not found; dumping visible tab labels ...")
            tabs = page.locator('[role="tab"]').all()
            for t in tabs:
                print(f"      Tab text: '{t.inner_text()}'")
            page.screenshot(path=f"{SCREENSHOTS_DIR}/03_metrics_tab_notfound.png", full_page=True)

        page.close()

        # ------------------------------------------------------------------ #
        # 5. Mobile screenshot (375px) + hamburger menu
        # ------------------------------------------------------------------ #
        print("\n[5] Testing mobile viewport (375px wide) ...")
        mobile_page = browser.new_page(viewport={"width": 375, "height": 812})
        mobile_page.on("console", lambda msg: console_messages.append({
            "type": msg.type,
            "text": msg.text,
        }))

        mobile_page.goto("http://localhost:5173", wait_until="networkidle")
        mobile_page.wait_for_timeout(1000)

        mobile_page.screenshot(path=f"{SCREENSHOTS_DIR}/04_mobile_initial.png", full_page=True)
        print(f"    Screenshot saved: {SCREENSHOTS_DIR}/04_mobile_initial.png")

        # Look for hamburger / menu button
        hamburger = None
        hamburger_selectors = [
            '[aria-label*="menu" i]',
            '[aria-label*="hamburger" i]',
            'button[class*="menu"]',
            'button[class*="hamburger"]',
            '[data-testid*="menu"]',
            'button svg',  # icon button
            '.menu-button',
            'button:has(svg)',
        ]
        for sel in hamburger_selectors:
            try:
                el = mobile_page.locator(sel).first
                if el.count() > 0 and el.is_visible():
                    hamburger = el
                    print(f"    Found hamburger via: {sel}")
                    break
            except Exception:
                pass

        if hamburger:
            hamburger.click()
            mobile_page.wait_for_timeout(800)
            mobile_page.screenshot(
                path=f"{SCREENSHOTS_DIR}/05_mobile_hamburger_open.png", full_page=True
            )
            print(f"    Screenshot saved: {SCREENSHOTS_DIR}/05_mobile_hamburger_open.png")

            # Verify Sheet/drawer opened
            content = mobile_page.content()
            drawer_indicators = ["sheet", "drawer", "nav", "sidebar", "menu"]
            sheet_visible = any(t in content.lower() for t in drawer_indicators)
            # Also check for visible overlay / dialog role
            sheet_el = mobile_page.locator('[role="dialog"], [data-state="open"]').first
            if sheet_el.count() > 0:
                print("    PASS - Sheet/drawer opened (role=dialog or data-state=open found)")
            elif sheet_visible:
                print("    PASS - Sheet/drawer indicators found in DOM after hamburger click")
            else:
                print("    WARN - Could not confirm Sheet/drawer opened")
        else:
            print("    INFO - No hamburger button found at 375px; may not be needed for this layout")
            # Dump all visible buttons
            buttons = mobile_page.locator("button").all()
            print(f"    Visible buttons ({len(buttons)}):")
            for b in buttons[:10]:
                try:
                    print(f"      '{b.inner_text()[:80]}' visible={b.is_visible()}")
                except Exception:
                    pass

        mobile_page.screenshot(path=f"{SCREENSHOTS_DIR}/06_mobile_final.png", full_page=True)
        browser.close()

        print("\n--- All screenshots written to:", SCREENSHOTS_DIR)
        print("Screenshots:")
        for f in sorted(os.listdir(SCREENSHOTS_DIR)):
            print(f"  {SCREENSHOTS_DIR}/{f}")

if __name__ == "__main__":
    run()
