import { expect, test } from '@playwright/test';
import { largeReorderedDataset } from './fixtures/large-dataset';

/**
 * These specs exist to verify the Web Worker + UI integration (loading
 * state, cancellation, main-thread responsiveness) - NOT diff/matching
 * algorithm correctness, which is covered by packages/core's Vitest suite
 * per AGENTS.md.
 *
 * The Compare button disables synchronously the instant `compare()` runs
 * (before any worker dispatch), so `toBeDisabled()` right after `.click()`
 * is a single, self-contained web-first assertion - reliable regardless of
 * how fast the diff itself resolves, since it isn't racing a second,
 * separate round-trip against the worker (unlike an earlier version of
 * this file, which paired a `toBeDisabled()` check with a follow-up
 * `toHaveAttribute('aria-busy', ...)` check on the next line: two
 * independent polls, with a real gap between them for the worker to
 * resolve in on fast/idle CI hardware). `disabled` and `[attr.aria-busy]`
 * are bound to the same `workspace.comparing()` signal in
 * home.component.html anyway, so asserting on `disabled` alone is
 * sufficient evidence of the busy state.
 *
 * LARGE_COUNT is intentionally modest: big enough to be a real (non-zero)
 * diff through the worker, small enough that the whole test stays fast and
 * deterministic rather than chasing an exact timing window.
 */
const LARGE_COUNT = 500;
const RESOLVE_TIMEOUT = 15_000;

// These three tests each drive a real diff through the worker concurrently
// with the other spec files; run them one at a time so multiple heavy
// Chromium instances aren't competing for CPU at once.
test.describe.configure({ mode: 'serial' });

test('disables the Compare button and shows a spinner while a large diff is in flight, then resolves', async ({ page }) => {
  await page.goto('/');

  const { left, right } = largeReorderedDataset(LARGE_COUNT);
  await page.getByLabel('ORIGINAL JSON').fill(left);
  await page.getByLabel('CHANGED JSON').fill(right);

  const compareButton = page.getByRole('button', { name: /Compare JSON|Comparing…/ });
  await compareButton.click();

  await expect(compareButton).toBeDisabled();

  // Resolves back to the idle state once the worker responds.
  await expect(compareButton).toBeEnabled({ timeout: RESOLVE_TIMEOUT });

  await page.getByRole('tab', { name: 'Tree' }).click();
  await expect(page.getByRole('tree')).toBeVisible();
  await page.getByRole('button', { name: 'Analysis' }).click();
  await expect(page.locator('.summary-card .stat-chip.total b')).not.toHaveText('0');
});

test('cancels a stale in-flight compare when a new one is started before it resolves', async ({ page }) => {
  await page.goto('/');

  // The Compare button is itself disabled while a compare is in flight, so a
  // second literal button click can't race the first. The other realistic
  // way this app re-dispatches a compare while one may still be running is
  // recompareSilently() (triggered by sidebar option/ignore-rule changes,
  // which stay enabled during comparing()) - so exercise cancellation via
  // that path: establish a small baseline result, start a large compare, and
  // toggle an option mid-flight to force a second (terminate-and-restart)
  // dispatch of the same large inputs.
  const small = { users: [{ userId: 1, name: 'Alice' }] };
  const smallChanged = { users: [{ userId: 1, name: 'Alicia' }] };
  await page.getByLabel('ORIGINAL JSON').fill(JSON.stringify(small));
  await page.getByLabel('CHANGED JSON').fill(JSON.stringify(smallChanged));
  await page.getByRole('button', { name: 'Compare JSON' }).click();
  await expect(page.locator('.source-scroll')).toContainText('Alicia');

  const big = largeReorderedDataset(LARGE_COUNT);
  await page.getByLabel('ORIGINAL JSON').fill(big.left);
  await page.getByLabel('CHANGED JSON').fill(big.right);

  const compareButton = page.getByRole('button', { name: /Compare JSON|Comparing…/ });
  await compareButton.click();
  await expect(compareButton).toBeDisabled();

  // Still mid-flight: toggle an unrelated option. Since a (stale, small)
  // result already exists, this triggers recompareSilently() - terminating
  // the first large worker call and dispatching a second one for the same
  // (large) inputs.
  await page.getByRole('checkbox', { name: /Normalize timestamps/ }).click();

  await expect(compareButton).toBeEnabled({ timeout: RESOLVE_TIMEOUT });

  // The final render must be a complete, uncorrupted result for the large
  // inputs - not the stale small baseline, and not a half-applied mix of the
  // two overlapping worker calls.
  const renderedDiff = page.locator('.source-scroll');
  await expect(renderedDiff).toContainText('SKU-0');
  await expect(renderedDiff).not.toContainText('Alicia');
  await page.getByRole('button', { name: 'Analysis' }).click();
  await expect(page.locator('.summary-card .stat-chip.total b')).not.toHaveText('0');
});

test('keeps the main thread responsive while a large diff runs in the worker', async ({ page }) => {
  await page.goto('/');

  const { left, right } = largeReorderedDataset(LARGE_COUNT);
  await page.getByLabel('ORIGINAL JSON').fill(left);
  await page.getByLabel('CHANGED JSON').fill(right);

  const compareButton = page.getByRole('button', { name: /Compare JSON|Comparing…/ });
  await compareButton.click();
  await expect(compareButton).toBeDisabled();

  // While the worker-side diff is still in flight, an unrelated control must
  // still respond promptly - proof the main thread isn't blocked by the
  // diff computation itself.
  const normalizeToggle = page.getByRole('checkbox', { name: /Normalize timestamps/ });
  await normalizeToggle.click({ timeout: 10_000 });
  await expect(normalizeToggle).not.toBeChecked();

  await expect(compareButton).toBeEnabled({ timeout: RESOLVE_TIMEOUT });
});

test('produces a correct, non-empty result via the worker path for a modest fixture', async ({ page }) => {
  await page.goto('/');

  const original = JSON.stringify({ users: [{ userId: 1, name: 'Alice' }] });
  const changed = JSON.stringify({ users: [{ userId: 1, name: 'Alicia' }] });

  await page.getByLabel('ORIGINAL JSON').fill(original);
  await page.getByLabel('CHANGED JSON').fill(changed);
  await page.getByRole('button', { name: 'Compare JSON' }).click();

  await page.getByRole('button', { name: 'Analysis' }).click();
  const summary = page.locator('.summary-card');
  await expect(summary.locator('.stat-chip.total b')).toHaveText('1');
  await expect(summary.locator('.stat-chip.added b')).toHaveText('+0');
  await expect(summary.locator('.stat-chip.removed b')).toHaveText('\u22120');
  await expect(summary.locator('.stat-chip.modified b')).toHaveText('~1');
});
