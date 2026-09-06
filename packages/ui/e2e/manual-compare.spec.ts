import { expect, test } from '@playwright/test';

/**
 * Critical workflow: manually paste two JSON documents, compare them, and
 * confirm both the Tree view and the Analysis summary reflect the diff.
 */
test('compares two pasted JSON documents and shows the diff', async ({ page }) => {
  await page.goto('/');

  const original = JSON.stringify({ users: [{ userId: 1, name: 'Alice' }] });
  const changed = JSON.stringify({ users: [{ userId: 1, name: 'Alicia' }] });

  await page.getByLabel('ORIGINAL JSON').fill(original);
  await page.getByLabel('CHANGED JSON').fill(changed);

  await page.getByRole('button', { name: 'Compare JSON' }).click();

  const tree = page.getByRole('tree');
  await expect(tree).toBeVisible();
  await expect(tree).toContainText('Alice');
  await expect(tree).toContainText('Alicia');

  // Open the analysis summary and check the exact counts.
  await page.getByRole('button', { name: 'Analysis' }).click();
  const summary = page.locator('.summary-card');
  await expect(summary.locator('.stat-chip.total b')).toHaveText('1');
  await expect(summary.locator('.stat-chip.added b')).toHaveText('+0');
  await expect(summary.locator('.stat-chip.removed b')).toHaveText('\u22120');
  await expect(summary.locator('.stat-chip.modified b')).toHaveText('~1');
});
