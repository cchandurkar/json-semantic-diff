import { expect, test } from '@playwright/test';
import { largeReorderedDataset } from './fixtures/large-dataset';

/**
 * These specs exist to verify the Web Worker + UI integration (loading
 * state, cancellation, main-thread responsiveness) - NOT diff/matching
 * algorithm correctness, which is covered by packages/core's Vitest suite
 * per AGENTS.md. The Compare button disables synchronously the instant
 * `compare()` runs (before any worker dispatch), so `toBeDisabled()` right
 * after `.click()` is deterministic regardless of how long the diff itself
 * takes; LARGE_COUNT only needs to be big enough that the busy window
 * doesn't close before the assertions that follow it run.
 */

const LARGE_COUNT = 800;
// Generous ceiling: CI runners can be slower/noisier than a typical dev
// machine, and this covers the dev-server's one-time cold-compile cost too.
const RESOLVE_TIMEOUT = 30_000;

// These three tests each drive a real (non-trivial) diff through the worker
// concurrently with the other spec files; run them one at a time so multiple
// heavy Chromium instances aren't competing for CPU at once, which otherwise
// risks flaking the timing-sensitive assertions below under parallel CI load.
test.describe.configure({ mode: 'serial' });

test('disables the Compare button and shows a spinner while a large diff is in flight, then resolves', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');

  const { left, right } = largeReorderedDataset(LARGE_COUNT);
  await page.getByLabel('ORIGINAL JSON').fill(left);
  await page.getByLabel('CHANGED JSON').fill(right);

  const compareButton = page.getByRole('button', { name: /Compare JSON|Comparing…/ });
  await compareButton.click();

  await expect(compareButton).toBeDisabled();
  await expect(compareButton).toHaveAttribute('aria-busy', 'true');

  // Resolves back to the idle state once the worker responds.
  await expect(compareButton).toBeEnabled({ timeout: RESOLVE_TIMEOUT });
  await expect(compareButton).toHaveAttribute('aria-busy', 'false');

  await page.getByRole('tab', { name: 'Tree' }).click();
  await expect(page.getByRole('tree')).toBeVisible();
  await page.getByRole('button', { name: 'Analysis' }).click();
  await expect(page.locator('.summary-card .stat-chip.total b')).not.toHaveText('0');
});

test('cancels a stale in-flight compare when a new one is started before it resolves', async ({ page }) => {
  test.setTimeout(45_000);
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
  // See the responsiveness test above for why this settle wait exists.
  await page.waitForTimeout(1_000);

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
  test.setTimeout(45_000);
  await page.goto('/');

  const { left, right } = largeReorderedDataset(LARGE_COUNT);
  await page.getByLabel('ORIGINAL JSON').fill(left);
  await page.getByLabel('CHANGED JSON').fill(right);
  // Let CodeMirror's own (separate, pre-existing) debounced linting of the
  // freshly-pasted large documents settle before timing anything - otherwise
  // a slow click here could reflect editor-linting backlog rather than the
  // diffJson-in-a-worker behavior this test is actually about.
  await page.waitForTimeout(1_000);

  const compareButton = page.getByRole('button', { name: /Compare JSON|Comparing…/ });
  await compareButton.click();
  await expect(compareButton).toBeDisabled();

  // While the worker-side diff is still in flight, an unrelated control must
  // still respond promptly - proof the main thread isn't blocked by the
  // diff computation itself.
  const normalizeToggle = page.getByRole('checkbox', { name: /Normalize timestamps/ });
  await normalizeToggle.click({ timeout: 15_000 });
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
