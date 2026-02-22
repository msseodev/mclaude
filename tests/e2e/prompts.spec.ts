import { test, expect } from '@playwright/test';

test.describe('Prompts Page', () => {
  // Clean up prompts before each test via API
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/api/prompts');
    const prompts = await res.json();
    for (const p of prompts) {
      await request.delete(`/api/prompts/${p.id}`);
    }
  });

  test('should show empty state when no prompts', async ({ page }) => {
    await page.goto('/prompts');
    await expect(page.locator('text=No prompts yet. Add one to get started.')).toBeVisible();
  });

  test('should show Add Prompt button', async ({ page }) => {
    await page.goto('/prompts');
    await expect(page.locator('button:has-text("Add Prompt")')).toBeVisible();
  });

  test('should open create modal when clicking Add Prompt', async ({ page }) => {
    await page.goto('/prompts');
    await page.click('button:has-text("Add Prompt")');
    await expect(page.locator('text=Add Prompt').nth(1)).toBeVisible();
    await expect(page.locator('input[placeholder="Prompt title"]')).toBeVisible();
    await expect(page.locator('textarea[placeholder="Prompt content..."]')).toBeVisible();
  });

  test('should create a new prompt', async ({ page }) => {
    await page.goto('/prompts');
    await page.click('button:has-text("Add Prompt")');

    await page.fill('input[placeholder="Prompt title"]', 'Test Prompt');
    await page.fill('textarea[placeholder="Prompt content..."]', 'Hello world');
    await page.click('button:has-text("Create")');

    // Modal should close and prompt should appear
    await expect(page.locator('text=Test Prompt')).toBeVisible();
    await expect(page.locator('text=Hello world')).toBeVisible();
  });

  test('should create prompt with working directory', async ({ page }) => {
    await page.goto('/prompts');
    await page.click('button:has-text("Add Prompt")');

    await page.fill('input[placeholder="Prompt title"]', 'Dir Prompt');
    await page.fill('textarea[placeholder="Prompt content..."]', 'Content');
    await page.fill('input[placeholder="/path/to/project"]', '/tmp/test');
    await page.click('button:has-text("Create")');

    await expect(page.locator('text=Dir Prompt')).toBeVisible();
    await expect(page.locator('text=Dir: /tmp/test')).toBeVisible();
  });

  test('should show pending badge on new prompts', async ({ page, request }) => {
    await request.post('/api/prompts', {
      data: { title: 'Badge Test', content: 'Content' },
    });

    await page.goto('/prompts');
    await expect(page.locator('text=pending')).toBeVisible();
  });

  test('should edit an existing prompt', async ({ page, request }) => {
    await request.post('/api/prompts', {
      data: { title: 'Original Title', content: 'Original Content' },
    });

    await page.goto('/prompts');
    await expect(page.locator('text=Original Title')).toBeVisible();

    // Click the edit button (pencil icon)
    await page.locator('button').filter({ has: page.locator('svg path[d*="16.862"]') }).click();

    // Modal should show with pre-filled data
    await expect(page.locator('text=Edit Prompt')).toBeVisible();
    await expect(page.locator('input[placeholder="Prompt title"]')).toHaveValue('Original Title');

    // Update title
    await page.fill('input[placeholder="Prompt title"]', 'Updated Title');
    await page.click('button:has-text("Save")');

    await expect(page.locator('text=Updated Title')).toBeVisible();
  });

  test('should delete a prompt', async ({ page, request }) => {
    await request.post('/api/prompts', {
      data: { title: 'Delete Me', content: 'Content' },
    });

    await page.goto('/prompts');
    await expect(page.locator('text=Delete Me')).toBeVisible();

    // Click the delete button (trash icon)
    await page.locator('button').filter({ has: page.locator('svg path[d*="14.74"]') }).click();

    // Confirm delete
    await expect(page.locator('text=Are you sure you want to delete this prompt?')).toBeVisible();
    await page.click('button:has-text("Delete")');

    // Prompt should be gone
    await expect(page.locator('text=Delete Me')).not.toBeVisible();
  });

  test('should cancel delete', async ({ page, request }) => {
    await request.post('/api/prompts', {
      data: { title: 'Keep Me', content: 'Content' },
    });

    await page.goto('/prompts');
    await page.locator('button').filter({ has: page.locator('svg path[d*="14.74"]') }).click();
    await page.click('button:has-text("Cancel")');

    await expect(page.locator('text=Keep Me')).toBeVisible();
  });

  test('should show multiple prompts in order', async ({ page, request }) => {
    await request.post('/api/prompts', {
      data: { title: 'First', content: 'C1' },
    });
    await request.post('/api/prompts', {
      data: { title: 'Second', content: 'C2' },
    });
    await request.post('/api/prompts', {
      data: { title: 'Third', content: 'C3' },
    });

    await page.goto('/prompts');
    // Wait for prompts to load
    await expect(page.locator('text=First')).toBeVisible();
    await expect(page.locator('text=Second')).toBeVisible();
    await expect(page.locator('text=Third')).toBeVisible();
  });
});
