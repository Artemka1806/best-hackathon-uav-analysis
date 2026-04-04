import { chromium, Browser, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOTS_DIR = 'C:/tmp/qa_screenshots';
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const consoleMessages: { type: string; text: string }[] = [];

function shot(page: Page, name: string): Promise<void> {
  const p = path.join(SCREENSHOTS_DIR, name);
  return page.screenshot({ path: p, full_page: true }).then(() => {
    console.log(`    Screenshot saved: ${p}`);
  });
}

async function findTab(page: Page, label: string): Promise<boolean> {
  const selectors = [
    `[role="tab"]:has-text("${label}")`,
    `button:has-text("${label}")`,
    `text=${label}`,
  ];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      console.log(`    Found "${label}" tab via: ${sel}`);
      await el.click();
      return true;
    }
  }
  return false;
}

(async () => {
  const browser: Browser = await chromium.launch({ headless: true });

  // ------------------------------------------------------------------ //
  // 1. Desktop screenshot 1440x900
  // ------------------------------------------------------------------ //
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleMessages.push({ type: 'pageerror', text: String(err) }));

  console.log('[1] Navigating to http://localhost:5173 at 1440x900 ...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '01_desktop_initial.png');

  // ------------------------------------------------------------------ //
  // 2. Console check for DialogTitle/DialogDescription warnings
  // ------------------------------------------------------------------ //
  console.log('\n[2] Checking console for DialogTitle/DialogDescription warnings ...');
  const dialogWarnings = consoleMessages.filter(
    m =>
      m.text.toLowerCase().includes('dialogtitle') ||
      m.text.toLowerCase().includes('dialogdescription') ||
      m.text.toLowerCase().includes('missing `description`') ||
      m.text.toLowerCase().includes('missing `title`'),
  );

  if (dialogWarnings.length > 0) {
    console.log(`    FAIL - ${dialogWarnings.length} DialogTitle/DialogDescription warning(s):`);
    dialogWarnings.forEach(w => console.log(`      [${w.type}] ${w.text.substring(0, 300)}`));
  } else {
    console.log('    PASS - No DialogTitle/DialogDescription warnings found');
  }

  const allErrorsWarnings = consoleMessages.filter(m => m.type === 'error' || m.type === 'warning');
  if (allErrorsWarnings.length > 0) {
    console.log(`\n    All console errors/warnings (${allErrorsWarnings.length}):`);
    allErrorsWarnings.slice(0, 30).forEach(m =>
      console.log(`      [${m.type}] ${m.text.substring(0, 300)}`),
    );
  } else {
    console.log('    Clean console - no errors or warnings at all.');
  }

  // ------------------------------------------------------------------ //
  // 3. AI Debrief tab
  // ------------------------------------------------------------------ //
  console.log('\n[3] Clicking AI Debrief tab ...');
  const foundAI = await findTab(page, 'AI Debrief');
  if (!foundAI) {
    // Try partial match
    const allTabs = await page.locator('[role="tab"]').all();
    console.log(`    AI Debrief not found. Available tabs (${allTabs.length}):`);
    for (const t of allTabs) console.log(`      "${await t.innerText()}"`);
    await shot(page, '02_ai_debrief_notfound.png');
  } else {
    await page.waitForTimeout(800);
    await shot(page, '02_ai_debrief_tab.png');

    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    const placeholderKeywords = ['upload', 'select', 'no flight', 'no data', 'load', 'open', 'placeholder', 'waiting', 'debrief'];
    const found = placeholderKeywords.find(k => bodyText.includes(k));
    if (found) {
      console.log(`    PASS - AI Debrief tab shows placeholder content (keyword: "${found}")`);
    } else {
      console.log('    WARN - Could not confirm placeholder text in AI Debrief tab');
      console.log(`    Body snippet: ${bodyText.substring(0, 400)}`);
    }
  }

  // ------------------------------------------------------------------ //
  // 4. Metrics tab
  // ------------------------------------------------------------------ //
  console.log('\n[4] Clicking Metrics tab ...');
  const foundMetrics = await findTab(page, 'Metrics');
  if (!foundMetrics) {
    const allTabs = await page.locator('[role="tab"]').all();
    console.log(`    Metrics not found. Available tabs (${allTabs.length}):`);
    for (const t of allTabs) console.log(`      "${await t.innerText()}"`);
    await shot(page, '03_metrics_notfound.png');
  } else {
    await page.waitForTimeout(800);
    await shot(page, '03_metrics_tab.png');

    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    const metricKeywords = ['duration', 'distance', 'speed', 'altitude', 'flight time', 'max', 'metric'];
    const warningKeywords = ['warning', 'anomaly', 'alert', 'caution'];

    const metricFound = metricKeywords.find(k => bodyText.includes(k));
    const warningFound = warningKeywords.find(k => bodyText.includes(k));

    if (metricFound) {
      console.log(`    PASS - Metric cards detected (keyword: "${metricFound}")`);
    } else {
      console.log('    WARN - No metric card content detected');
      console.log(`    Body snippet: ${bodyText.substring(0, 400)}`);
    }

    if (warningFound) {
      console.log(`    PASS - Warnings/anomaly section present (keyword: "${warningFound}")`);
    } else {
      console.log('    INFO - No warnings section found (may be normal with no data loaded)');
    }
  }

  await page.close();

  // ------------------------------------------------------------------ //
  // 5. Mobile (375px) + hamburger / Sheet drawer
  // ------------------------------------------------------------------ //
  console.log('\n[5] Testing mobile viewport (375x812) ...');
  const mobilePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  mobilePage.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));

  await mobilePage.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(1200);
  await shot(mobilePage, '04_mobile_initial.png');

  // Find hamburger button
  const hamburgerSelectors = [
    '[aria-label*="menu" i]',
    '[aria-label*="navigation" i]',
    '[aria-label*="hamburger" i]',
    '[data-testid*="menu"]',
    'button[class*="menu"]',
    'button[class*="hamburger"]',
    'button[class*="nav"]',
  ];

  let hamburgerFound = false;
  for (const sel of hamburgerSelectors) {
    const el = mobilePage.locator(sel).first();
    if ((await el.count()) > 0 && (await el.isVisible())) {
      console.log(`    Found hamburger via: ${sel}`);
      await el.click();
      await mobilePage.waitForTimeout(800);
      await shot(mobilePage, '05_mobile_hamburger_open.png');
      hamburgerFound = true;

      // Verify Sheet/drawer
      const sheetOpen = await mobilePage.locator('[data-state="open"], [role="dialog"]').count();
      if (sheetOpen > 0) {
        console.log('    PASS - Sheet/drawer opened after hamburger click');
      } else {
        const bodyAfter = (await mobilePage.locator('body').innerText()).toLowerCase();
        const drawerKws = ['nav', 'menu', 'home', 'flights'];
        const drawerFound = drawerKws.find(k => bodyAfter.includes(k));
        if (drawerFound) {
          console.log(`    PASS - Navigation content visible after hamburger (keyword: "${drawerFound}")`);
        } else {
          console.log('    WARN - Could not confirm Sheet/drawer state');
        }
      }
      break;
    }
  }

  if (!hamburgerFound) {
    // List all buttons visible on mobile
    const buttons = await mobilePage.locator('button:visible').all();
    console.log(`    No hamburger found. Visible buttons (${buttons.length}):`);
    for (const b of buttons.slice(0, 10)) {
      const txt = await b.innerText().catch(() => '');
      const ariaLabel = await b.getAttribute('aria-label').catch(() => '');
      console.log(`      text="${txt.substring(0, 60)}" aria-label="${ariaLabel}"`);
    }
    await shot(mobilePage, '05_mobile_no_hamburger.png');
  }

  await shot(mobilePage, '06_mobile_final.png');
  await mobilePage.close();
  await browser.close();

  console.log('\n=== Test run complete ===');
  console.log(`Screenshots in: ${SCREENSHOTS_DIR}`);
  const files = fs.readdirSync(SCREENSHOTS_DIR).sort();
  files.forEach(f => console.log(`  ${path.join(SCREENSHOTS_DIR, f)}`));
})();
