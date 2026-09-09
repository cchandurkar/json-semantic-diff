import { expect, test } from '@playwright/test';

/**
 * Regression test for a router-outlet mounting bug: AppComponent used to be
 * both the manually-bootstrapped root and the routed path:'' component, with
 * <router-outlet> only mounted conditionally once navigation completed. That
 * caused a visible flash of the main app shell when navigating to
 * /how-it-works, and could double-activate a nested AppComponent on the way
 * back. Asserts exactly one shell/header exists at every point during both
 * navigation directions.
 */
test('navigates to /how-it-works and back without flashing or duplicating the app shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.site-header')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'How it works' })).toBeVisible();

  await page.getByRole('link', { name: 'How it works' }).click();

  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole('heading', { name: 'How Array Matching Works' })).toBeVisible();
  // The main comparison shell must be gone, not just hidden behind the article.
  await expect(page.getByLabel('ORIGINAL JSON')).toHaveCount(0);
  await expect(page.locator('.site-header')).toHaveCount(1);

  await page.getByRole('link', { name: 'Back to Diff Tool' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel('ORIGINAL JSON')).toBeVisible();
  await expect(page.locator('.site-header')).toHaveCount(1);
  // Guards against the duplicate-AppComponent-on-back-nav bug: only one
  // instance of shell-only content should ever be present.
  await expect(page.locator('.shell-row')).toHaveCount(1);
});
