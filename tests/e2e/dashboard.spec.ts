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

  test('should show executions section content', async ({ page }) => {
    await page.goto('/');
    // Either shows empty state or shows execution list (depending on DB state)
    const section = page.locator('text=Recent Executions');
    await expect(section).toBeVisible();
    const body = await page.textContent('body');
    const hasEmptyState = body?.includes('No executions yet');
    const hasViewHistory = body?.includes('View all history');
    expect(hasEmptyState || hasViewHistory).toBe(true);
  });
});
