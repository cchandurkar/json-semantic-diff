import { expect, test } from '@playwright/test';

/**
 * Critical workflow: loading a built-in example populates both editors and
 * automatically computes a diff (no manual "Compare" click required).
 */
test('loads the first built-in example and computes a diff automatically', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Load example' }).click();
  // First entry in DIFF_EXAMPLES (diff-examples.ts): API_RESPONSE.
  await page.getByRole('menuitem', { name: /API Response/ }).click();

  await expect(page.getByLabel('ORIGINAL JSON')).not.toBeEmpty();
  await expect(page.getByLabel('CHANGED JSON')).not.toBeEmpty();

  await expect(page.getByRole('tree')).toBeVisible();

  await page.getByRole('button', { name: 'Analysis' }).click();
  const total = page.locator('.summary-card .stat-chip.total b');
  await expect(total).not.toHaveText('0');
});
