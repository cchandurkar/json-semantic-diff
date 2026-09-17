import { expect, test } from '@playwright/test';

/**
 * Critical workflow: loading a built-in example populates both editors and
 * automatically computes a diff (no manual "Compare" click required).
 */
test('loads the first built-in example and computes a diff automatically', async ({ page }) => {
  await page.goto('/');

  // Target the sidebar's example-picker trigger specifically: the hero
  // section also has a "Load Example" chip with the same accessible name
  // (case-insensitive match), so a bare role+name locator is ambiguous.
  await page.locator('[data-tour="example-picker-trigger"]').click();
  // First entry in DIFF_EXAMPLES (diff-examples.ts): API_RESPONSE.
  // Anchored to the start: "Noisy API Response" also contains "API Response"
  // as a substring and would otherwise match too (strict-mode violation).
  await page.getByRole('menuitem', { name: /^API Response/ }).click();

  await expect(page.getByLabel('ORIGINAL JSON')).not.toBeEmpty();
  await expect(page.getByLabel('CHANGED JSON')).not.toBeEmpty();

  // Source is the default view; switch to Tree to verify it renders too.
  await page.getByRole('tab', { name: 'Tree' }).click();
  await expect(page.getByRole('tree')).toBeVisible();

  await page.getByRole('button', { name: 'Analysis' }).click();
  const total = page.locator('.summary-card .stat-chip.total b');
  await expect(total).not.toHaveText('0');
});
