// Standalone Playwright script — NOT part of the e2e/ test suite, not wired
// into CI or `test:e2e`. Records a short demo video plus a handful of
// screenshots of the app's core flow (load example -> compare -> tree ->
// source -> analysis) for README/marketing use.
//
// PREREQUISITE: the Angular dev server must already be running at
// http://localhost:4200 before running this script. In another terminal,
// from packages/ui:
//
//   npm run start
//
// Then, from packages/ui:
//
//   npm run demo:record
//
// Output:
//   demo/output/video/*.webm       - the recorded session
//   demo/output/screenshots/*.png  - the 5 screenshots below
//
// See demo/README.md for post-processing (webm -> GIF) instructions.

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:4200';
const HEADLESS = process.env.HEADLESS === '1';

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: 'demo/output/video', size: { width: 1280, height: 800 } }
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 15_000 });
  } catch (error) {
    console.error(
      `\nFailed to load ${BASE_URL}. Make sure \`npm run start\` is running in packages/ui first.\n`
    );
    await context.close();
    await browser.close();
    throw error;
  }

  // 1. Empty initial state.
  await page.screenshot({ path: 'demo/output/screenshots/01-empty-state.png' });

  // 2. Load the "API Response" built-in example.
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('menuitem', { name: 'API Response' }).click();

  // Poll until both JSON editors have content rather than relying on a fixed sleep.
  await Promise.all([
    page.waitForFunction(
      () => {
        const el = document.querySelector('[aria-label="ORIGINAL JSON"]');
        return !!el && (el.textContent ?? '').trim().length > 0;
      },
      null,
      { timeout: 5_000 }
    ),
    page.waitForFunction(
      () => {
        const el = document.querySelector('[aria-label="CHANGED JSON"]');
        return !!el && (el.textContent ?? '').trim().length > 0;
      },
      null,
      { timeout: 5_000 }
    )
  ]);

  await page.screenshot({ path: 'demo/output/screenshots/02-filled-editors.png' });

  // 3. Compare and wait for the tree result.
  await page.getByRole('button', { name: 'Compare JSON' }).click();
  await page.locator('.tree[role="tree"]').waitFor({ state: 'visible', timeout: 10_000 });

  await page.screenshot({ path: 'demo/output/screenshots/03-tree-result.png' });

  // 4. Switch to the Source view.
  await page.getByRole('button', { name: 'Source' }).click();

  await page.screenshot({ path: 'demo/output/screenshots/04-source-view.png' });

  // 5. Open the Analysis panel.
  await page.getByRole('button', { name: 'Analysis' }).click();

  await page.screenshot({ path: 'demo/output/screenshots/05-analysis-panel.png' });

  // Short pause so the recorded video has a clean tail before it closes.
  await page.waitForTimeout(1_000);

  const videoPath = await page.video()?.path();

  await context.close();
  await browser.close();

  console.log(`\nDemo recording complete.`);
  console.log(`Video: ${videoPath}`);
  console.log(`Screenshots: demo/output/screenshots/*.png`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
