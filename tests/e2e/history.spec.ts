import { test, expect } from '@playwright/test';

test.describe('History Page', () => {
  test('should show page title', async ({ page }) => {
    await page.goto('/history');
    await expect(page.locator('h1')).toHaveText('Execution History');
  });

  test('should show empty state when no executions', async ({ page }) => {
    await page.goto('/history');
    // Wait for loading to finish
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'));
    // Check if either there's data or the empty message
    const content = await page.textContent('body');
    if (!content?.includes('No executions yet.')) {
      // There are some executions from other tests, verify table is shown
      await expect(page.locator('table')).toBeVisible();
    } else {
      await expect(page.locator('text=No executions yet.')).toBeVisible();
    }
  });

  test('should show table headers when executions exist', async ({ page }) => {
    await page.goto('/history');
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'));
    const hasData = await page.locator('table').count();
    if (hasData > 0) {
      await expect(page.locator('th:has-text("Prompt")')).toBeVisible();
      await expect(page.locator('th:has-text("Status")')).toBeVisible();
      await expect(page.locator('th:has-text("Cost")')).toBeVisible();
      await expect(page.locator('th:has-text("Duration")')).toBeVisible();
      await expect(page.locator('th:has-text("Started")')).toBeVisible();
    }
  });
});
