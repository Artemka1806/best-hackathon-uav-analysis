/**
 * QA visual verification script for UAV Analysis dashboard.
 * Run with: npx playwright test --headed  OR  node qa_visual_check.mjs
 * Uses raw Playwright API (not test runner) so it can be executed directly.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const SCREENSHOTS_DIR = '/tmp/uav_qa_screenshots';
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const BASE_URL = 'http://localhost:5173';
const results = [];

function log(label, passed, detail = '') {
  const status = passed ? 'PASS' : 'FAIL';
  results.push({ status, label, detail });
  console.log(`[${status}] ${label}${detail ? ': ' + detail : ''}`);
}

// Use explicit path because project Playwright 1.58.2 expects v1212 which
// isn't downloaded — fall back to installed v1217 (non-headless-shell full chrome)
const CHROMIUM_PATH = 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe';
const browser = await chromium.launch({
  headless: true,
  executablePath: CHROMIUM_PATH,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

// ── 1. DESKTOP VIEWPORT ──────────────────────────────────────────────────────
const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktopCtx.newPage();

const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') consoleErrors.push(msg);
});

await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500); // let animations settle

// Screenshot 1: baseline desktop full page
await page.screenshot({ path: join(SCREENSHOTS_DIR, '01_desktop_baseline.png'), fullPage: true });
log('Page loads without crash', true);

// ── Sidebar checks ────────────────────────────────────────────────────────────
// Sidebar = aside with hidden lg:flex classes
const sidebar = page.locator('aside').first();
const sidebarVisible = await sidebar.isVisible();
log('Sidebar visible on desktop', sidebarVisible);

// Header: UAV Analysis text
const headerText = page.locator('aside h1').first();
const headerVisible = await headerText.isVisible();
const headerInnerText = headerVisible ? await headerText.innerText() : '';
log('Sidebar: UAV Analysis header text', headerVisible && headerInnerText.includes('UAV Analysis'), headerInnerText || 'NOT FOUND');

// Plane icon container
const planeIconContainer = page.locator('aside .rounded-xl').first();
log('Sidebar: Icon container (plane) present', await planeIconContainer.count() > 0);

// File upload input
const fileInput = page.locator("aside input[type='file']");
const fileInputCount = await fileInput.count();
log('Sidebar: File upload input present', fileInputCount > 0);
if (fileInputCount > 0) {
  const acceptAttr = await fileInput.getAttribute('accept');
  log('Sidebar: File upload accepts .bin/.BIN', acceptAttr?.includes('.bin') || acceptAttr?.includes('.BIN'), `accept="${acceptAttr}"`);
}

// Color mode select trigger
const colorModeSelect = page.locator("aside [role='combobox']").first();
const colorModeVisible = await colorModeSelect.isVisible();
log('Sidebar: Color mode select present', colorModeVisible);
if (colorModeVisible) {
  const selectText = await colorModeSelect.innerText();
  log('Sidebar: Color mode shows default value', selectText.toLowerCase().includes('speed'), `text="${selectText}"`);
}

// Analyze button (gold gradient)
const analyzeBtn = page.locator('aside button').filter({ hasText: 'Analyze' });
const analyzeBtnVisible = await analyzeBtn.isVisible();
log('Sidebar: Analyze button visible', analyzeBtnVisible);
if (analyzeBtnVisible) {
  const btnClass = await analyzeBtn.getAttribute('class') || '';
  const hasGradient = btnClass.includes('gradient') || btnClass.includes('from-') || btnClass.includes('bg-gradient');
  log('Sidebar: Analyze button has gradient styling', hasGradient, btnClass.slice(0, 100));
  const btnDisabled = await analyzeBtn.isDisabled();
  log('Analyze button disabled without file', btnDisabled);
}

// Tabs: AI Debrief and Metrics
const aiTab = page.locator("[role='tab']").filter({ hasText: 'AI Debrief' });
const metricsTab = page.locator("[role='tab']").filter({ hasText: 'Metrics' });
log('Sidebar: AI Debrief tab present', await aiTab.count() > 0);
log('Sidebar: Metrics tab present', await metricsTab.count() > 0);

// Screenshot 2: sidebar close-up
if (sidebarVisible) {
  await sidebar.screenshot({ path: join(SCREENSHOTS_DIR, '02_sidebar_desktop.png') });
}

// ── Main content: Cesium 3D viewer ────────────────────────────────────────────
const mainEl = page.locator('main');
const mainVisible = await mainEl.isVisible();
log('Main content area visible', mainVisible);

const cesiumSection = page.locator('main section').first();
const cesiumSectionVisible = await cesiumSection.isVisible();
log('Main content: Cesium viewer section visible', cesiumSectionVisible);

// Cesium typically renders a canvas or a div with id
const cesiumCanvas = page.locator('#cesiumContainer, #cesium-container, canvas').first();
const cesiumCanvasCount = await cesiumCanvas.count();
log('Main content: Cesium canvas/container present', cesiumCanvasCount > 0);

// Check for border beam or rounded styling on the cesium section
if (cesiumSectionVisible) {
  await cesiumSection.screenshot({ path: join(SCREENSHOTS_DIR, '03_cesium_viewer.png') });
}

// ── Telemetry charts section ──────────────────────────────────────────────────
const chartSection = page.locator('main section').nth(1);
const chartSectionExists = await chartSection.count() > 0;
log('Telemetry charts section present', chartSectionExists);

if (chartSectionExists) {
  const chartSectionVisible = await chartSection.isVisible();
  log('Telemetry charts section visible', chartSectionVisible);

  // Check glass-panel divs inside — 3 charts expected
  const glassPanels = chartSection.locator('.glass-panel');
  const glassPanelCount = await glassPanels.count();
  log('Telemetry charts: glass-panel chart cards found', glassPanelCount >= 3, `count=${glassPanelCount}`);

  await chartSection.screenshot({ path: join(SCREENSHOTS_DIR, '04_telemetry_charts.png') });
}

// ── Dark theme checks ─────────────────────────────────────────────────────────
const uavBgVar = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--uav-bg').trim()
);
log('Dark theme: --uav-bg CSS variable defined', !!uavBgVar, `value='${uavBgVar}'`);

const uavAccentVar = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--uav-accent').trim()
);
log('Dark theme: --uav-accent CSS variable defined (gold)', !!uavAccentVar, `value='${uavAccentVar}'`);

const uavPrimaryVar = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--uav-primary').trim()
);
log('Dark theme: --uav-primary CSS variable defined (cyan)', !!uavPrimaryVar, `value='${uavPrimaryVar}'`);

// Screenshot 5: full page desktop
await page.screenshot({ path: join(SCREENSHOTS_DIR, '05_full_desktop.png'), fullPage: true });

await desktopCtx.close();

// ── 2. MOBILE VIEWPORT (375px) ────────────────────────────────────────────────
const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const mobilePage = await mobileCtx.newPage();
const mobileConsoleErrors = [];
mobilePage.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') mobileConsoleErrors.push(msg);
});

await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
await mobilePage.waitForTimeout(1500);

// Screenshot 6: mobile baseline
await mobilePage.screenshot({ path: join(SCREENSHOTS_DIR, '06_mobile_baseline.png'), fullPage: true });

// Mobile header should be visible (hidden on lg, shown below)
const mobileHeader = mobilePage.locator('header').first();
const mobileHeaderVisible = await mobileHeader.isVisible();
log('Mobile: Mobile header visible', mobileHeaderVisible);

// UAV Analysis title in mobile header
const mobileTitleEl = mobilePage.locator('header h1').first();
const mobileTitleVisible = await mobileTitleEl.isVisible();
const mobileTitleText = mobileTitleVisible ? await mobileTitleEl.innerText() : '';
log('Mobile: UAV Analysis title in header', mobileTitleVisible && mobileTitleText.includes('UAV Analysis'), mobileTitleText || 'NOT FOUND');

// Desktop sidebar should not be visible on mobile
const desktopSidebar = mobilePage.locator('aside').first();
const desktopSidebarVisible = await desktopSidebar.isVisible();
log('Mobile: Desktop sidebar hidden', !desktopSidebarVisible);

// Menu (hamburger) button in header
const menuButton = mobilePage.locator('header button').first();
const menuButtonVisible = await menuButton.isVisible();
log('Mobile: Menu button visible', menuButtonVisible);

if (mobileHeaderVisible) {
  await mobileHeader.screenshot({ path: join(SCREENSHOTS_DIR, '07_mobile_header.png') });
}

// ── Sheet (slide-out drawer) test ─────────────────────────────────────────────
if (menuButtonVisible) {
  await menuButton.click();
  await mobilePage.waitForTimeout(700); // animation

  // Screenshot 8: Sheet open
  await mobilePage.screenshot({ path: join(SCREENSHOTS_DIR, '08_mobile_sheet_open.png'), fullPage: true });

  // Check for Sheet/dialog content
  const sheetDialog = mobilePage.locator("[role='dialog']");
  const sheetDialogCount = await sheetDialog.count();
  log('Mobile: Sheet drawer opened (dialog role)', sheetDialogCount > 0);

  if (sheetDialogCount > 0) {
    const sheetVisible = await sheetDialog.first().isVisible();
    log('Mobile: Sheet drawer is visible', sheetVisible);

    // Verify sidebar content inside Sheet
    const sheetFileInput = mobilePage.locator("input[type='file']");
    log('Mobile Sheet: File upload input present', await sheetFileInput.count() > 0);

    const sheetAnalyzeBtn = mobilePage.locator('button').filter({ hasText: 'Analyze' });
    log('Mobile Sheet: Analyze button present', await sheetAnalyzeBtn.count() > 0);

    const sheetAiTab = mobilePage.locator("[role='tab']").filter({ hasText: 'AI Debrief' });
    log('Mobile Sheet: AI Debrief tab present', await sheetAiTab.count() > 0);

    const sheetMetricsTab = mobilePage.locator("[role='tab']").filter({ hasText: 'Metrics' });
    log('Mobile Sheet: Metrics tab present', await sheetMetricsTab.count() > 0);
  } else {
    log('Mobile: Sheet drawer opened (dialog role)', false, 'No dialog role element found — Sheet may use different attribute');
  }

  // Close Sheet
  await mobilePage.keyboard.press('Escape');
  await mobilePage.waitForTimeout(400);
  await mobilePage.screenshot({ path: join(SCREENSHOTS_DIR, '09_mobile_sheet_closed.png'), fullPage: true });
  log('Mobile: Sheet closes on Escape', !(await mobilePage.locator("[role='dialog']").isVisible().catch(() => false)));
}

await mobileCtx.close();
await browser.close();

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log('QA TEST SUMMARY');
console.log('='.repeat(60));
const passed = results.filter(r => r.status === 'PASS');
const failed = results.filter(r => r.status === 'FAIL');
console.log(`Total: ${results.length}  |  Passed: ${passed.length}  |  Failed: ${failed.length}`);

if (passed.length) {
  console.log('\nPASSED:');
  passed.forEach(r => console.log(`  + ${r.label}${r.detail ? ' (' + r.detail + ')' : ''}`));
}
if (failed.length) {
  console.log('\nFAILED:');
  failed.forEach(r => console.log(`  - ${r.label}${r.detail ? ' (' + r.detail + ')' : ''}`));
}

const allErrors = [...consoleErrors, ...mobileConsoleErrors];
if (allErrors.length) {
  console.log(`\nCONSOLE ERRORS/WARNINGS: ${allErrors.length}`);
  allErrors.slice(0, 15).forEach(msg => {
    console.log(`  [${msg.type().toUpperCase()}] ${msg.text().slice(0, 150)}`);
  });
}

console.log(`\nScreenshots saved to: ${SCREENSHOTS_DIR}`);
