import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test('should show settings form', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toHaveText('Settings');
    await expect(page.getByText('Working Directory', { exact: true })).toBeVisible();
    await expect(page.getByText('Claude Binary', { exact: true })).toBeVisible();
  });

  test('should load current settings values', async ({ page }) => {
    await page.goto('/settings');
    // Wait for settings to load
    await page.waitForSelector('input[placeholder="/path/to/project"]');
    const workDirInput = page.locator('input[placeholder="/path/to/project"]');
    const value = await workDirInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test('should show Save Settings button', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('button:has-text("Save Settings")')).toBeVisible();
  });

  test('should save settings and show confirmation', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('input[placeholder="/path/to/project"]');

    // Change the claude binary value
    const binaryInput = page.locator('input[placeholder="claude"]');
    await binaryInput.clear();
    await binaryInput.fill('claude-test');

    await page.click('button:has-text("Save Settings")');
    await expect(page.locator('text=Settings saved')).toBeVisible();
  });

  test('should persist saved settings on reload', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('input[placeholder="/path/to/project"]');

    const binaryInput = page.locator('input[placeholder="claude"]');
    await binaryInput.clear();
    await binaryInput.fill('claude-custom');
    await page.click('button:has-text("Save Settings")');
    await expect(page.locator('text=Settings saved')).toBeVisible();

    // Reload and verify
    await page.reload();
    await page.waitForSelector('input[placeholder="claude"]');
    await expect(page.locator('input[placeholder="claude"]')).toHaveValue('claude-custom');

    // Reset back to 'claude'
    await binaryInput.clear();
    await binaryInput.fill('claude');
    await page.click('button:has-text("Save Settings")');
  });

  test('should show description text for fields', async ({ page }) => {
    await page.goto('/settings');
    await expect(
      page.locator("text=Default working directory for prompts that don't specify one.")
    ).toBeVisible();
    await expect(
      page.locator('text=Path to the Claude CLI binary.')
    ).toBeVisible();
  });
});
