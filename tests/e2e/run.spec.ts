import { test, expect } from '@playwright/test';

test.describe('Run Page', () => {
  test('should show page title', async ({ page }) => {
    await page.goto('/run');
    await expect(page.locator('h1')).toHaveText('Run Queue');
  });

  test('should show idle status badge', async ({ page }) => {
    await page.goto('/run');
    // Wait for status to load
    await page.waitForTimeout(500);
    const badges = page.locator('span:has-text("idle")');
    await expect(badges.first()).toBeVisible();
  });

  test('should show Start button when idle', async ({ page }) => {
    await page.goto('/run');
    await page.waitForTimeout(500);
    await expect(page.locator('button:has-text("Start")')).toBeVisible();
  });

  test('should show output placeholder text', async ({ page }) => {
    await page.goto('/run');
    await expect(
      page.locator('text=Output will appear here when the queue is running...')
    ).toBeVisible();
  });

  test('should show SSE connection status', async ({ page }) => {
    await page.goto('/run');
    // SSE connection indicator should appear
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Live')).toBeVisible();
  });
});
