import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test('should show queue status card', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Queue Status')).toBeVisible();
  });

  test('should show idle status by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Queue Status: Idle')).toBeVisible();
  });

  test('should show Manage Prompts button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Manage Prompts')).toBeVisible();
  });

  test('should show Start Queue button when idle', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Start Queue')).toBeVisible();
  });

  test('should navigate to prompts page from Manage Prompts button', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Manage Prompts');
    await expect(page).toHaveURL('/prompts');
  });

  test('should show Recent Executions section', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Recent Executions')).toBeVisible();
  });

  test('should show empty state when no executions', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator('text=No executions yet. Add prompts and start the queue.')
    ).toBeVisible();
  });
});
