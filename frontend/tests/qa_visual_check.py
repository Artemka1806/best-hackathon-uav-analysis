"""
QA visual verification script for UAV Analysis dashboard.
Tests: sidebar elements, Cesium viewer, telemetry charts, dark theme,
mobile responsive layout, and Sheet drawer on mobile.
"""
from playwright.sync_api import sync_playwright
import os

SCREENSHOTS_DIR = "/tmp/uav_qa_screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

BASE_URL = "http://localhost:3000"

results = []

def log(label, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    results.append((status, label, detail))
    print(f"[{status}] {label}{': ' + detail if detail else ''}")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # ── 1. DESKTOP VIEWPORT ──────────────────────────────────────────────────
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    # Capture console errors
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg) if msg.type in ("error", "warning") else None)

    page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1500)  # let animations settle

    # Screenshot 1: baseline desktop
    page.screenshot(path=f"{SCREENSHOTS_DIR}/01_desktop_baseline.png", full_page=True)
    log("Page loads without crash", True)

    # ── Sidebar checks ────────────────────────────────────────────────────────
    # The sidebar is only visible on lg+ screens (hidden lg:flex w-[380px])
    sidebar = page.locator("aside.hidden.lg\\:flex")
    log("Sidebar visible on desktop", sidebar.is_visible())

    # Header: UAV Analysis text + Plane icon area
    header_text = page.locator("aside h1").first
    has_header = header_text.is_visible() and "UAV Analysis" in header_text.inner_text()
    log("Sidebar: UAV Analysis header", has_header, header_text.inner_text() if header_text.is_visible() else "NOT FOUND")

    # Plane icon container
    plane_icon_wrapper = page.locator("aside .rounded-xl.bg-\\[var\\(--uav-accent\\)\\/10\\]").first
    log("Sidebar: Plane icon wrapper visible", plane_icon_wrapper.is_visible())

    # File upload input
    file_input = page.locator("aside input[type='file']")
    log("Sidebar: File upload input present", file_input.count() > 0)
    log("Sidebar: File upload accepts .bin", file_input.get_attribute("accept") in (".bin,.BIN", ".BIN,.bin") if file_input.count() > 0 else False)

    # Color mode select
    color_mode_trigger = page.locator("aside [role='combobox']").first
    log("Sidebar: Color mode select present", color_mode_trigger.is_visible())
    log("Sidebar: Color mode default value visible", "speed" in color_mode_trigger.inner_text().lower() if color_mode_trigger.is_visible() else False,
        color_mode_trigger.inner_text() if color_mode_trigger.is_visible() else "NOT FOUND")

    # Analyze button (gold gradient)
    analyze_btn = page.locator("aside button").filter(has_text="Analyze")
    log("Sidebar: Analyze button present", analyze_btn.is_visible())
    btn_class = analyze_btn.get_attribute("class") or ""
    log("Sidebar: Analyze button has gold gradient", "from-" in btn_class and "to-" in btn_class, btn_class[:80])

    # Tabs: AI Debrief and Metrics
    ai_tab = page.locator("[role='tab']").filter(has_text="AI Debrief")
    metrics_tab = page.locator("[role='tab']").filter(has_text="Metrics")
    log("Sidebar: AI Debrief tab present", ai_tab.count() > 0)
    log("Sidebar: Metrics tab present", metrics_tab.count() > 0)

    # Screenshot 2: sidebar close-up
    sidebar.screenshot(path=f"{SCREENSHOTS_DIR}/02_sidebar_desktop.png")

    # ── Main content: Cesium viewer ───────────────────────────────────────────
    # CesiumViewer renders a div with id="cesium-container" or a canvas
    cesium_section = page.locator("main section").first
    log("Main content: Cesium section present", cesium_section.is_visible())

    # Check for border-beam wrapper (the motion section has rounded styling)
    main_area = page.locator("main")
    log("Main content area visible", main_area.is_visible())

    # Screenshot 3: main content area
    main_area.screenshot(path=f"{SCREENSHOTS_DIR}/03_main_content.png")

    # ── Telemetry charts section ──────────────────────────────────────────────
    # TelemetryCharts lives in the second <section> inside <main>
    chart_section = page.locator("main section").nth(1)
    log("Telemetry charts section present", chart_section.count() > 0)
    if chart_section.count() > 0:
        chart_section.screenshot(path=f"{SCREENSHOTS_DIR}/04_telemetry_charts.png")

    # Check for glass-panel divs inside the chart section (3 charts expected)
    # Charts render canvas elements inside recharts or similar
    chart_section_html = page.locator("main section").nth(1).inner_html() if chart_section.count() > 0 else ""
    has_chart_content = len(chart_section_html) > 100
    log("Telemetry charts section has content", has_chart_content)

    # ── Dark theme checks ─────────────────────────────────────────────────────
    # Check background color of body/root — should be dark navy
    bg_color = page.evaluate("""
        () => getComputedStyle(document.documentElement).getPropertyValue('--uav-bg').trim()
    """)
    log("Dark theme: --uav-bg CSS var defined", bool(bg_color), f"value='{bg_color}'")

    accent_color = page.evaluate("""
        () => getComputedStyle(document.documentElement).getPropertyValue('--uav-accent').trim()
    """)
    log("Dark theme: --uav-accent CSS var defined (gold)", bool(accent_color), f"value='{accent_color}'")

    primary_color = page.evaluate("""
        () => getComputedStyle(document.documentElement).getPropertyValue('--uav-primary').trim()
    """)
    log("Dark theme: --uav-primary CSS var defined (cyan)", bool(primary_color), f"value='{primary_color}'")

    # Screenshot 4: full page desktop
    page.screenshot(path=f"{SCREENSHOTS_DIR}/05_full_desktop.png", full_page=True)

    # ── Analyze button disabled without file ──────────────────────────────────
    btn_disabled = analyze_btn.is_disabled()
    log("Analyze button disabled when no file selected", btn_disabled)

    # ── 2. MOBILE VIEWPORT (375px) ───────────────────────────────────────────
    mobile_page = browser.new_page(viewport={"width": 375, "height": 812})
    mobile_console_errors = []
    mobile_page.on("console", lambda msg: mobile_console_errors.append(msg) if msg.type in ("error", "warning") else None)

    mobile_page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
    mobile_page.wait_for_timeout(1500)

    # Screenshot 5: mobile baseline
    mobile_page.screenshot(path=f"{SCREENSHOTS_DIR}/06_mobile_baseline.png", full_page=True)

    # Mobile header should be visible (lg:hidden → visible on mobile)
    mobile_header = mobile_page.locator("header.lg\\:hidden")
    log("Mobile: Mobile header visible", mobile_header.is_visible())

    # UAV Analysis title in mobile header
    mobile_title = mobile_page.locator("header h1")
    log("Mobile: UAV Analysis title in header", mobile_title.is_visible() and "UAV Analysis" in mobile_title.inner_text())

    # Desktop sidebar should be hidden on mobile
    desktop_sidebar = mobile_page.locator("aside.hidden")
    # On mobile the aside has 'hidden' class so it won't be visible
    sidebar_hidden = not desktop_sidebar.is_visible()
    log("Mobile: Desktop sidebar hidden", sidebar_hidden)

    # Menu button (hamburger) visible
    menu_btn = mobile_page.locator("header button").filter(has_text="")
    menu_icon = mobile_page.locator("header button svg")
    log("Mobile: Menu (hamburger) button present", mobile_page.locator("header button").count() > 0)

    # Screenshot 6: mobile close-up of header
    mobile_header.screenshot(path=f"{SCREENSHOTS_DIR}/07_mobile_header.png")

    # ── Sheet (slide-out drawer) test ─────────────────────────────────────────
    # Click the menu button to open the Sheet
    menu_button = mobile_page.locator("header button[class*='ghost']").first
    if menu_button.count() == 0:
        # Try by icon
        menu_button = mobile_page.locator("header button").first

    log("Mobile: Menu button found for Sheet test", menu_button.is_visible())

    # Click to open
    menu_button.click()
    mobile_page.wait_for_timeout(600)  # wait for animation

    # Sheet content should be visible after click
    sheet_content = mobile_page.locator("[data-radix-dialog-content], [role='dialog']")
    # Alternatively look for the SheetContent's class
    sheet_panel = mobile_page.locator(".w-\\[360px\\]")
    sheet_open = sheet_content.count() > 0 or sheet_panel.count() > 0

    if sheet_content.count() > 0:
        log("Mobile: Sheet drawer opened", sheet_content.first.is_visible())
    elif sheet_panel.count() > 0:
        log("Mobile: Sheet drawer opened (by class)", sheet_panel.first.is_visible())
    else:
        # Check if any overlay appeared
        overlay = mobile_page.locator("[data-radix-dialog-overlay]")
        log("Mobile: Sheet drawer opened (overlay check)", overlay.count() > 0)

    # Screenshot 7: Sheet open on mobile
    mobile_page.screenshot(path=f"{SCREENSHOTS_DIR}/08_mobile_sheet_open.png", full_page=True)

    # Verify sidebar content inside Sheet
    if sheet_content.count() > 0 or sheet_panel.count() > 0:
        container = sheet_content.first if sheet_content.count() > 0 else sheet_panel.first
        # File input should be inside
        sheet_file_input = mobile_page.locator("input[type='file']")
        log("Mobile Sheet: File upload input present", sheet_file_input.count() > 0)

        sheet_analyze_btn = mobile_page.locator("button").filter(has_text="Analyze")
        log("Mobile Sheet: Analyze button present", sheet_analyze_btn.count() > 0)

        sheet_ai_tab = mobile_page.locator("[role='tab']").filter(has_text="AI Debrief")
        log("Mobile Sheet: AI Debrief tab present", sheet_ai_tab.count() > 0)

    # Close Sheet by pressing Escape
    mobile_page.keyboard.press("Escape")
    mobile_page.wait_for_timeout(400)
    mobile_page.screenshot(path=f"{SCREENSHOTS_DIR}/09_mobile_sheet_closed.png", full_page=True)

    browser.close()

# ── Print Summary ─────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("QA TEST SUMMARY")
print("=" * 60)
passed = [r for r in results if r[0] == "PASS"]
failed = [r for r in results if r[0] == "FAIL"]
print(f"Total: {len(results)}  |  Passed: {len(passed)}  |  Failed: {len(failed)}")
print()

if passed:
    print("PASSED:")
    for _, label, detail in passed:
        print(f"  + {label}" + (f" ({detail})" if detail else ""))

if failed:
    print("\nFAILED:")
    for _, label, detail in failed:
        print(f"  - {label}" + (f" ({detail})" if detail else ""))

if console_errors:
    print(f"\nCONSOLE ERRORS/WARNINGS (desktop): {len(console_errors)}")
    for msg in console_errors[:10]:
        print(f"  [{msg.type.upper()}] {msg.text[:120]}")

print(f"\nScreenshots saved to: {SCREENSHOTS_DIR}")
