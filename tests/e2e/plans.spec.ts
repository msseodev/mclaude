import { test, expect } from '@playwright/test';

test.describe('Plans API', () => {
  // Clean up plans before each test
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/api/plans');
    const plans = await res.json();
    for (const p of plans) {
      await request.delete(`/api/plans/${p.id}`);
    }
  });

  test('GET /api/plans should return array', async ({ request }) => {
    const res = await request.get('/api/plans');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/plans should create a plan', async ({ request }) => {
    const res = await request.post('/api/plans', {
      data: { name: 'Test Plan', description: 'A test', plan_prompt: 'Be thorough' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Test Plan');
    expect(body.description).toBe('A test');
    expect(body.plan_prompt).toBe('Be thorough');
    expect(body.id).toBeDefined();

    await request.delete(`/api/plans/${body.id}`);
  });

  test('POST /api/plans should return 400 when name is missing', async ({ request }) => {
    const res = await request.post('/api/plans', {
      data: { description: 'No name' },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/plans/:id should return plan with items', async ({ request }) => {
    const createRes = await request.post('/api/plans', {
      data: { name: 'Detail Plan' },
    });
    const plan = await createRes.json();

    const res = await request.get(`/api/plans/${plan.id}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.name).toBe('Detail Plan');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(0);

    await request.delete(`/api/plans/${plan.id}`);
  });

  test('PUT /api/plans/:id should update a plan', async ({ request }) => {
    const createRes = await request.post('/api/plans', {
      data: { name: 'Original' },
    });
    const plan = await createRes.json();

    const res = await request.put(`/api/plans/${plan.id}`, {
      data: { name: 'Updated', plan_prompt: 'New prompt' },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.name).toBe('Updated');
    expect(body.plan_prompt).toBe('New prompt');

    await request.delete(`/api/plans/${plan.id}`);
  });

  test('DELETE /api/plans/:id should delete a plan', async ({ request }) => {
    const createRes = await request.post('/api/plans', {
      data: { name: 'Delete Me' },
    });
    const plan = await createRes.json();

    const deleteRes = await request.delete(`/api/plans/${plan.id}`);
    expect(deleteRes.ok()).toBe(true);

    const getRes = await request.get(`/api/plans/${plan.id}`);
    expect(getRes.status()).toBe(404);
  });

  test('should add and remove plan items', async ({ request }) => {
    // Create a prompt and a plan
    const promptRes = await request.post('/api/prompts', {
      data: { title: 'Item Test Prompt', content: 'Content' },
    });
    const prompt = await promptRes.json();

    const planRes = await request.post('/api/plans', {
      data: { name: 'Item Test Plan' },
    });
    const plan = await planRes.json();

    // Add item
    const addRes = await request.post(`/api/plans/${plan.id}/items`, {
      data: { prompt_id: prompt.id },
    });
    expect(addRes.status()).toBe(201);
    const item = await addRes.json();
    expect(item.prompt_id).toBe(prompt.id);
    expect(item.prompt_title).toBe('Item Test Prompt');

    // Verify item appears in plan detail
    const detailRes = await request.get(`/api/plans/${plan.id}`);
    const detail = await detailRes.json();
    expect(detail.items).toHaveLength(1);

    // Remove item
    const removeRes = await request.delete(`/api/plans/${plan.id}/items/${item.id}`);
    expect(removeRes.ok()).toBe(true);

    // Verify item is gone
    const detailRes2 = await request.get(`/api/plans/${plan.id}`);
    const detail2 = await detailRes2.json();
    expect(detail2.items).toHaveLength(0);

    // Cleanup
    await request.delete(`/api/plans/${plan.id}`);
    await request.delete(`/api/prompts/${prompt.id}`);
  });

  test('should reorder plan items', async ({ request }) => {
    // Create prompts and a plan
    const p1Res = await request.post('/api/prompts', { data: { title: 'P1', content: 'C1' } });
    const p2Res = await request.post('/api/prompts', { data: { title: 'P2', content: 'C2' } });
    const p3Res = await request.post('/api/prompts', { data: { title: 'P3', content: 'C3' } });
    const p1 = await p1Res.json();
    const p2 = await p2Res.json();
    const p3 = await p3Res.json();

    const planRes = await request.post('/api/plans', { data: { name: 'Reorder Plan' } });
    const plan = await planRes.json();

    // Add items in order
    const i1Res = await request.post(`/api/plans/${plan.id}/items`, { data: { prompt_id: p1.id } });
    const i2Res = await request.post(`/api/plans/${plan.id}/items`, { data: { prompt_id: p2.id } });
    const i3Res = await request.post(`/api/plans/${plan.id}/items`, { data: { prompt_id: p3.id } });
    const i1 = await i1Res.json();
    const i2 = await i2Res.json();
    const i3 = await i3Res.json();

    // Reverse order
    const reorderRes = await request.put(`/api/plans/${plan.id}/items/reorder`, {
      data: { orderedIds: [i3.id, i2.id, i1.id] },
    });
    expect(reorderRes.ok()).toBe(true);

    // Verify
    const detailRes = await request.get(`/api/plans/${plan.id}`);
    const detail = await detailRes.json();
    expect(detail.items[0].prompt_title).toBe('P3');
    expect(detail.items[1].prompt_title).toBe('P2');
    expect(detail.items[2].prompt_title).toBe('P1');

    // Cleanup
    await request.delete(`/api/plans/${plan.id}`);
    await request.delete(`/api/prompts/${p1.id}`);
    await request.delete(`/api/prompts/${p2.id}`);
    await request.delete(`/api/prompts/${p3.id}`);
  });

  test('should add same prompt multiple times to a plan', async ({ request }) => {
    const promptRes = await request.post('/api/prompts', {
      data: { title: 'Reusable', content: 'Content' },
    });
    const prompt = await promptRes.json();

    const planRes = await request.post('/api/plans', { data: { name: 'Dupe Plan' } });
    const plan = await planRes.json();

    await request.post(`/api/plans/${plan.id}/items`, { data: { prompt_id: prompt.id } });
    await request.post(`/api/plans/${plan.id}/items`, { data: { prompt_id: prompt.id } });

    const detailRes = await request.get(`/api/plans/${plan.id}`);
    const detail = await detailRes.json();
    expect(detail.items).toHaveLength(2);
    expect(detail.items[0].prompt_id).toBe(prompt.id);
    expect(detail.items[1].prompt_id).toBe(prompt.id);

    // Cleanup
    await request.delete(`/api/plans/${plan.id}`);
    await request.delete(`/api/prompts/${prompt.id}`);
  });
});

test.describe('Plans Page', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/api/plans');
    const plans = await res.json();
    for (const p of plans) {
      await request.delete(`/api/plans/${p.id}`);
    }
  });

  test('should show empty state when no plans', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.locator('text=No plans yet.')).toBeVisible();
  });

  test('should show Create Plan button', async ({ page }) => {
    await page.goto('/plans');
    await expect(page.locator('button:has-text("Create Plan")')).toBeVisible();
  });

  test('should create a new plan', async ({ page }) => {
    await page.goto('/plans');
    await page.click('button:has-text("Create Plan")');

    await page.fill('input[placeholder="Plan name"]', 'My Test Plan');
    await page.fill('textarea[placeholder="What this plan does..."]', 'A description');
    // Click the Create button inside the modal footer (exact match)
    await page.locator('button:text-is("Create")').click();

    await expect(page.locator('text=My Test Plan')).toBeVisible();
    await expect(page.locator('text=A description')).toBeVisible();
  });

  test('should navigate to plan detail page', async ({ page, request }) => {
    const res = await request.post('/api/plans', {
      data: { name: 'Detail Test Plan', description: 'Test description' },
    });
    const plan = await res.json();

    await page.goto('/plans');
    await page.click('text=Detail Test Plan');

    await expect(page).toHaveURL(`/plans/${plan.id}`);
    await expect(page.locator('h1:has-text("Detail Test Plan")')).toBeVisible();
  });

  test('should delete a plan', async ({ page, request }) => {
    await request.post('/api/plans', {
      data: { name: 'Delete Plan' },
    });

    await page.goto('/plans');
    await expect(page.locator('text=Delete Plan')).toBeVisible();

    // Click the delete button (trash icon)
    await page.locator('button').filter({ has: page.locator('svg path[d*="14.74"]') }).click();

    await expect(page.locator('text=Are you sure you want to delete "Delete Plan"?')).toBeVisible();
    await page.locator('button:text-is("Delete")').click();

    // The plan card text should disappear (only the page title remains)
    await expect(page.locator('.rounded-lg.border:has-text("Delete Plan")')).not.toBeVisible();
  });
});

test.describe('Plan Detail Page', () => {
  let planId: string;
  let promptIds: string[] = [];

  test.beforeEach(async ({ request }) => {
    // Clean up
    const plansRes = await request.get('/api/plans');
    const plans = await plansRes.json();
    for (const p of plans) {
      await request.delete(`/api/plans/${p.id}`);
    }
    const promptsRes = await request.get('/api/prompts');
    const prompts = await promptsRes.json();
    for (const p of prompts) {
      await request.delete(`/api/prompts/${p.id}`);
    }

    // Create test prompts
    promptIds = [];
    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      const res = await request.post('/api/prompts', {
        data: { title, content: `Content for ${title}` },
      });
      const prompt = await res.json();
      promptIds.push(prompt.id);
    }

    // Create test plan
    const planRes = await request.post('/api/plans', {
      data: { name: 'Test Plan', description: 'Test desc', plan_prompt: 'Be careful' },
    });
    const plan = await planRes.json();
    planId = plan.id;
  });

  test('should show plan details', async ({ page }) => {
    await page.goto(`/plans/${planId}`);
    await expect(page.locator('h1:has-text("Test Plan")')).toBeVisible();
    await expect(page.locator('text=Test desc')).toBeVisible();
    await expect(page.locator('text=Be careful')).toBeVisible();
  });

  test('should show empty items state', async ({ page }) => {
    await page.goto(`/plans/${planId}`);
    await expect(page.locator('text=No prompts in this plan.')).toBeVisible();
  });

  test('should add prompt to plan', async ({ page }) => {
    await page.goto(`/plans/${planId}`);
    await page.click('button:has-text("Add Prompt")');

    // Select the first prompt from the modal
    await page.click('text=Alpha');

    // Item should appear in the list
    await expect(page.locator('text=Alpha').first()).toBeVisible();
    await expect(page.locator('text=Prompts (1)')).toBeVisible();
  });

  test('should remove item from plan', async ({ page, request }) => {
    // Add an item via API
    await request.post(`/api/plans/${planId}/items`, {
      data: { prompt_id: promptIds[0] },
    });

    await page.goto(`/plans/${planId}`);
    await expect(page.locator('text=Alpha').first()).toBeVisible();

    // Click the remove button (X icon)
    await page.locator('button').filter({ has: page.locator('svg path[d*="6 18L18 6"]') }).click();

    await expect(page.locator('text=No prompts in this plan.')).toBeVisible();
  });

  test('should edit plan details', async ({ page }) => {
    await page.goto(`/plans/${planId}`);
    await page.click('button:has-text("Edit Plan")');

    await expect(page.locator('text=Edit Plan').nth(1)).toBeVisible();

    await page.fill('input[placeholder="Plan name"]', 'Updated Plan Name');
    await page.click('button:has-text("Save")');

    await expect(page.locator('h1:has-text("Updated Plan Name")')).toBeVisible();
  });

  test('should have Run Plan button that links to run page', async ({ page }) => {
    await page.goto(`/plans/${planId}`);
    const runButton = page.locator('button:has-text("Run Plan")');
    await expect(runButton).toBeVisible();
  });

  test('should show Back to Plans link', async ({ page }) => {
    await page.goto(`/plans/${planId}`);
    await page.click('text=Back to Plans');
    await expect(page).toHaveURL('/plans');
  });
});

test.describe('Run Page with Plans', () => {
  test.beforeEach(async ({ request }) => {
    const plansRes = await request.get('/api/plans');
    const plans = await plansRes.json();
    for (const p of plans) {
      await request.delete(`/api/plans/${p.id}`);
    }
  });

  test('should show plan selector on run page', async ({ page, request }) => {
    await request.post('/api/plans', {
      data: { name: 'Run Test Plan' },
    });

    await page.goto('/run');
    // There should be a select with the plan option
    await expect(page.locator('select').first()).toBeVisible();
    await expect(page.locator('option:has-text("Run Test Plan")')).toBeAttached();
  });

  test('should pre-select plan from URL params', async ({ page, request }) => {
    const planRes = await request.post('/api/plans', {
      data: { name: 'URL Plan' },
    });
    const plan = await planRes.json();

    await page.goto(`/run?planId=${plan.id}`);
    // The plan selector should have the plan pre-selected
    const select = page.locator('select').first();
    await expect(select).toHaveValue(plan.id);
  });
});

test.describe('Settings - Global Prompt', () => {
  test('should show global prompt field', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('text=Global Prompt')).toBeVisible();
    await expect(page.locator('textarea[placeholder*="prepend to every prompt"]')).toBeVisible();
  });

  test('should save and persist global prompt', async ({ page, request }) => {
    // Reset global prompt
    await request.put('/api/settings', {
      data: { global_prompt: '' },
    });

    await page.goto('/settings');
    await page.fill('textarea[placeholder*="prepend to every prompt"]', 'Use Clean Architecture');
    await page.click('button:has-text("Save Settings")');

    await expect(page.locator('text=Settings saved')).toBeVisible();

    // Verify via API
    const res = await request.get('/api/settings');
    const settings = await res.json();
    expect(settings.global_prompt).toBe('Use Clean Architecture');

    // Cleanup
    await request.put('/api/settings', {
      data: { global_prompt: '' },
    });
  });
});

test.describe('Sidebar Navigation', () => {
  test('should show Plans link in sidebar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav a:has-text("Plans")')).toBeVisible();
  });

  test('should navigate to plans page from sidebar', async ({ page }) => {
    await page.goto('/');
    await page.click('nav a:has-text("Plans")');
    await expect(page).toHaveURL('/plans');
    await expect(page.locator('h1:has-text("Execution Plans")')).toBeVisible();
  });
});

test.describe('Dashboard with Plans', () => {
  test('should show Manage Plans button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Manage Plans')).toBeVisible();
  });

  test('should show run status with plan fields', async ({ request }) => {
    const res = await request.get('/api/run/status');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect('planId' in body).toBe(true);
    expect('planName' in body).toBe(true);
  });
});
