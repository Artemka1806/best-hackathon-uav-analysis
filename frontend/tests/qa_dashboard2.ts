import { chromium, Browser, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOTS_DIR = 'C:/tmp/qa_screenshots2';
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const consoleMessages: { type: string; text: string }[] = [];

async function shot(page: Page, name: string): Promise<void> {
  const p = path.join(SCREENSHOTS_DIR, name);
  await page.screenshot({ path: p, full_page: true });
  console.log(`    Screenshot saved: ${p}`);
}

async function dismissCesiumError(page: Page): Promise<void> {
  // Dismiss any error overlay/dialog that CesiumJS may show
  const okSelectors = [
    'button:has-text("OK")',
    'button:has-text("Dismiss")',
    'button:has-text("Close")',
    '[role="dialog"] button',
    '.cesium-widget-errorPanel-buttonPanel button',
    '.error-panel button',
  ];
  for (const sel of okSelectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0 && (await el.isVisible())) {
      console.log(`    Dismissing error overlay via: ${sel}`);
      await el.click();
      await page.waitForTimeout(400);
      break;
    }
  }
}

async function findAndClickTab(page: Page, label: string): Promise<boolean> {
  const selectors = [
    `[role="tab"]:has-text("${label}")`,
    `button:has-text("${label}")`,
    `a:has-text("${label}")`,
  ];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      await el.click();
      return true;
    }
  }
  return false;
}

(async () => {
  const browser: Browser = await chromium.launch({ headless: true });

  // ================================================================== //
  // DESKTOP 1440x900
  // ================================================================== //
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleMessages.push({ type: 'pageerror', text: String(err) }));

  console.log('[DESKTOP] Navigating to http://localhost:5173 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Dismiss CesiumJS error if present
  await dismissCesiumError(page);
  await page.waitForTimeout(500);

  console.log('\n[1] Desktop initial state (1440x900)');
  await shot(page, '01_desktop_initial.png');

  // ------------------------------------------------------------------ //
  // Console analysis
  // ------------------------------------------------------------------ //
  console.log('\n[2] Console analysis ...');
  const dialogWarnings = consoleMessages.filter(m =>
    /dialogtitle|dialogdescription|missing.*description|missing.*title/i.test(m.text)
  );
  if (dialogWarnings.length > 0) {
    console.log(`    FAIL - ${dialogWarnings.length} DialogTitle/DialogDescription warning(s):`);
    dialogWarnings.forEach(w => console.log(`      [${w.type}] ${w.text.substring(0, 300)}`));
  } else {
    console.log('    PASS - No DialogTitle/DialogDescription warnings');
  }

  const errors = consoleMessages.filter(m => m.type === 'error');
  const warnings = consoleMessages.filter(m => m.type === 'warning');
  const cesiumErrors = consoleMessages.filter(m => /cesium|webgl|context_lost/i.test(m.text));
  console.log(`    Total errors: ${errors.length}, warnings: ${warnings.length}, cesium-related: ${cesiumErrors.length}`);

  const nonCesiumErrors = errors.filter(m => !/cesium|webgl|context_lost/i.test(m.text));
  if (nonCesiumErrors.length > 0) {
    console.log(`    Non-Cesium errors (${nonCesiumErrors.length}):`);
    nonCesiumErrors.forEach(m => console.log(`      ${m.text.substring(0, 300)}`));
  }

  // ------------------------------------------------------------------ //
  // AI Debrief tab
  // ------------------------------------------------------------------ //
  console.log('\n[3] AI Debrief tab ...');
  const foundAI = await findAndClickTab(page, 'AI Debrief');
  if (foundAI) {
    await page.waitForTimeout(800);
    await dismissCesiumError(page);
    await shot(page, '02_ai_debrief_tab.png');

    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    const kw = ['upload', 'select', 'no flight', 'no data', 'load', 'open', 'placeholder', 'waiting', 'debrief', 'flight log', 'bin file'];
    const hit = kw.find(k => bodyText.includes(k));
    console.log(hit
      ? `    PASS - Placeholder shown (keyword: "${hit}")`
      : `    WARN - No placeholder keyword found. Snippet: ${bodyText.substring(0, 300)}`
    );
  } else {
    const tabs = await page.locator('[role="tab"]').all();
    console.log(`    WARN - AI Debrief tab not found. Tabs: ${(await Promise.all(tabs.map(t => t.innerText()))).join(', ')}`);
    await shot(page, '02_ai_debrief_missing.png');
  }

  // ------------------------------------------------------------------ //
  // Metrics tab
  // ------------------------------------------------------------------ //
  console.log('\n[4] Metrics tab ...');
  const foundMetrics = await findAndClickTab(page, 'Metrics');
  if (foundMetrics) {
    await page.waitForTimeout(800);
    await dismissCesiumError(page);
    await shot(page, '03_metrics_tab.png');

    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    const metricKws = ['duration', 'distance', 'speed', 'altitude', 'flight time', 'max speed', 'max altitude', 'metric'];
    const warningKws = ['warning', 'anomaly', 'alert', 'caution'];
    const mHit = metricKws.find(k => bodyText.includes(k));
    const wHit = warningKws.find(k => bodyText.includes(k));
    console.log(mHit
      ? `    PASS - Metric cards found (keyword: "${mHit}")`
      : `    WARN - No metric keywords. Snippet: ${bodyText.substring(0, 300)}`
    );
    console.log(wHit
      ? `    PASS - Warnings section found (keyword: "${wHit}")`
      : `    INFO - No warnings section (expected with no data loaded)`
    );
  } else {
    const tabs = await page.locator('[role="tab"]').all();
    console.log(`    WARN - Metrics tab not found. Tabs: ${(await Promise.all(tabs.map(t => t.innerText()))).join(', ')}`);
    await shot(page, '03_metrics_missing.png');
  }

  await page.close();

  // ================================================================== //
  // MOBILE 375x812
  // ================================================================== //
  console.log('\n[5] Mobile viewport 375x812 ...');
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  mobile.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));

  await mobile.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);
  await dismissCesiumError(mobile);
  await shot(mobile, '04_mobile_initial.png');

  // Look for hamburger — try SVG icon buttons, aria-label, className patterns
  const hamburgerSelectors = [
    'header button',
    'nav button',
    '[aria-label*="menu" i]',
    '[aria-label*="navigation" i]',
    '[aria-label*="open" i]',
    'button[class*="menu"]',
    'button[class*="burger"]',
    'button[class*="toggle"]',
    // Shadcn Sheet trigger is usually just a plain <Button>
    'button:has(svg)',
  ];

  let hamburgerFound = false;
  for (const sel of hamburgerSelectors) {
    const els = await mobile.locator(sel).all();
    for (const el of els) {
      if (await el.isVisible()) {
        const txt = await el.innerText().catch(() => '');
        const ariaLabel = await el.getAttribute('aria-label').catch(() => '');
        // Skip devtools button
        if (/devtools/i.test(ariaLabel ?? '') || /tanstack/i.test(txt)) continue;

        console.log(`    Clicking potential hamburger: sel="${sel}" text="${txt}" aria="${ariaLabel}"`);
        await el.click();
        await mobile.waitForTimeout(1000);
        await shot(mobile, '05_mobile_menu_open.png');
        hamburgerFound = true;

        // Check sheet opened
        const sheetCount = await mobile.locator('[data-state="open"]').count();
        const dialogCount = await mobile.locator('[role="dialog"]').count();
        if (sheetCount > 0 || dialogCount > 0) {
          console.log(`    PASS - Sheet/drawer opened (data-state=open: ${sheetCount}, role=dialog: ${dialogCount})`);
        } else {
          const bodyAfter = (await mobile.locator('body').innerText()).toLowerCase();
          const navKws = ['home', 'flights', 'analysis', 'map', 'dashboard', 'upload'];
          const navHit = navKws.find(k => bodyAfter.includes(k));
          console.log(navHit
            ? `    PASS - Navigation content visible (keyword: "${navHit}")`
            : '    WARN - Could not confirm Sheet/drawer state'
          );
        }
        break;
      }
    }
    if (hamburgerFound) break;
  }

  if (!hamburgerFound) {
    console.log('    INFO - No hamburger button found at 375px');
    // Show all buttons for investigation
    const allBtns = await mobile.locator('button').all();
    console.log(`    All buttons on mobile (${allBtns.length}):`);
    for (const b of allBtns) {
      const txt = await b.innerText().catch(() => '');
      const cls = await b.getAttribute('class').catch(() => '');
      const aria = await b.getAttribute('aria-label').catch(() => '');
      const vis = await b.isVisible();
      console.log(`      text="${txt.substring(0,50)}" class="${(cls??'').substring(0,60)}" aria="${aria}" visible=${vis}`);
    }
    await shot(mobile, '05_mobile_no_hamburger.png');
  }

  await shot(mobile, '06_mobile_final.png');
  await mobile.close();
  await browser.close();

  console.log('\n=== Done. Screenshots in:', SCREENSHOTS_DIR, '===');
  fs.readdirSync(SCREENSHOTS_DIR).sort().forEach(f =>
    console.log(`  ${path.join(SCREENSHOTS_DIR, f)}`)
  );
})();
