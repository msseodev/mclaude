import { test, expect } from '@playwright/test';

test.describe('Auto Agents Page', () => {
  // Clean up custom agents before each test
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/api/auto/agents');
    const agents = await res.json();
    for (const agent of agents) {
      if (!agent.is_builtin) {
        await request.delete(`/api/auto/agents/${agent.id}`);
      }
    }
  });

  test('displays agent management page', async ({ page }) => {
    await page.goto('/auto/agents');
    await expect(page.locator('h1')).toHaveText('Agent Pipeline');
  });

  test('lists 4 built-in agents', async ({ page }) => {
    await page.goto('/auto/agents');
    await expect(page.locator('text=Product Designer')).toBeVisible();
    await expect(page.locator('text=Developer')).toBeVisible();
    await expect(page.locator('text=Reviewer')).toBeVisible();
    await expect(page.locator('text=QA Engineer')).toBeVisible();
  });

  test('shows built-in tag for builtin agents', async ({ page }) => {
    await page.goto('/auto/agents');
    const builtinBadges = page.locator('text=Built-in');
    await expect(builtinBadges).toHaveCount(4);
  });

  test('displays agents in pipeline order', async ({ page }) => {
    await page.goto('/auto/agents');
    // Wait for agents to load
    await expect(page.locator('text=Product Designer')).toBeVisible();

    // Each agent row has a pipeline_order number shown in a rounded circle.
    // The built-in agents are ordered: 1 (Product Designer), 2 (Developer), 3 (Reviewer), 4 (QA Engineer).
    // Verify the display_name ordering by checking their relative positions in the DOM.
    const agentNames = page.locator('.text-sm.font-semibold.text-gray-900');
    const names = await agentNames.allTextContents();
    const designerIdx = names.indexOf('Product Designer');
    const developerIdx = names.indexOf('Developer');
    const reviewerIdx = names.indexOf('Reviewer');
    const qaIdx = names.indexOf('QA Engineer');

    expect(designerIdx).toBeLessThan(developerIdx);
    expect(developerIdx).toBeLessThan(reviewerIdx);
    expect(reviewerIdx).toBeLessThan(qaIdx);
  });

  test('shows New Agent button', async ({ page }) => {
    await page.goto('/auto/agents');
    await expect(page.locator('button:has-text("+ New Agent")')).toBeVisible();
  });

  test('shows Edit and Disable buttons for each agent', async ({ page }) => {
    await page.goto('/auto/agents');
    await expect(page.locator('text=Product Designer')).toBeVisible();

    const editButtons = page.locator('button:has-text("Edit")');
    await expect(editButtons).toHaveCount(4);

    const disableButtons = page.locator('button:has-text("Disable")');
    await expect(disableButtons).toHaveCount(4);
  });

  test('does not show Delete button for built-in agents', async ({ page }) => {
    await page.goto('/auto/agents');
    await expect(page.locator('text=Product Designer')).toBeVisible();

    // Built-in agents should not have a Delete button
    const deleteButtons = page.locator('button:has-text("Delete")');
    await expect(deleteButtons).toHaveCount(0);
  });
});

test.describe('Auto Agents API', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/api/auto/agents');
    const agents = await res.json();
    for (const agent of agents) {
      if (!agent.is_builtin) {
        await request.delete(`/api/auto/agents/${agent.id}`);
      }
    }
  });

  test('GET /api/auto/agents returns built-in agents', async ({ request }) => {
    const res = await request.get('/api/auto/agents');
    expect(res.status()).toBe(200);
    const agents = await res.json();
    expect(agents.length).toBeGreaterThanOrEqual(4);
    expect(agents.find((a: { name: string }) => a.name === 'product_designer')).toBeTruthy();
    expect(agents.find((a: { name: string }) => a.name === 'developer')).toBeTruthy();
    expect(agents.find((a: { name: string }) => a.name === 'reviewer')).toBeTruthy();
    expect(agents.find((a: { name: string }) => a.name === 'qa_engineer')).toBeTruthy();
  });

  test('GET /api/auto/agents returns agents sorted by pipeline_order', async ({ request }) => {
    const res = await request.get('/api/auto/agents');
    const agents = await res.json();
    for (let i = 1; i < agents.length; i++) {
      expect(agents[i].pipeline_order).toBeGreaterThanOrEqual(agents[i - 1].pipeline_order);
    }
  });

  test('GET /api/auto/agents/:id returns a single agent', async ({ request }) => {
    const res = await request.get('/api/auto/agents/builtin-developer');
    expect(res.status()).toBe(200);
    const agent = await res.json();
    expect(agent.name).toBe('developer');
    expect(agent.display_name).toBe('Developer');
    expect(agent.is_builtin).toBe(1);
  });

  test('GET /api/auto/agents/:id returns 404 for non-existent agent', async ({ request }) => {
    const res = await request.get('/api/auto/agents/non-existent-id');
    expect(res.status()).toBe(404);
  });

  test('POST /api/auto/agents creates custom agent', async ({ request }) => {
    const res = await request.post('/api/auto/agents', {
      data: {
        name: 'security_auditor',
        display_name: 'Security Auditor',
        role_description: 'Audits code for security vulnerabilities',
        system_prompt: 'You are a security auditor.',
        pipeline_order: 3.5,
      },
    });
    expect(res.status()).toBe(201);
    const agent = await res.json();
    expect(agent.name).toBe('security_auditor');
    expect(agent.display_name).toBe('Security Auditor');
    expect(agent.role_description).toBe('Audits code for security vulnerabilities');
    expect(agent.system_prompt).toBe('You are a security auditor.');
    expect(agent.pipeline_order).toBe(3.5);
    expect(agent.is_builtin).toBe(0);
    expect(agent.enabled).toBe(1);
    expect(agent.id).toBeDefined();
    expect(agent.created_at).toBeDefined();
    expect(agent.updated_at).toBeDefined();
  });

  test('POST /api/auto/agents validates required fields', async ({ request }) => {
    // Missing display_name and system_prompt
    const res = await request.post('/api/auto/agents', {
      data: { name: 'test' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('POST /api/auto/agents rejects missing name', async ({ request }) => {
    const res = await request.post('/api/auto/agents', {
      data: {
        display_name: 'Test Agent',
        system_prompt: 'You are a test agent.',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/auto/agents rejects missing system_prompt', async ({ request }) => {
    const res = await request.post('/api/auto/agents', {
      data: {
        name: 'test_agent',
        display_name: 'Test Agent',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('PUT /api/auto/agents/:id updates agent', async ({ request }) => {
    // Create first
    const createRes = await request.post('/api/auto/agents', {
      data: {
        name: 'test_agent',
        display_name: 'Test Agent',
        system_prompt: 'You are a test agent.',
        pipeline_order: 5,
      },
    });
    const created = await createRes.json();

    // Update
    const updateRes = await request.put(`/api/auto/agents/${created.id}`, {
      data: { display_name: 'Updated Agent', role_description: 'Updated description' },
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.display_name).toBe('Updated Agent');
    expect(updated.role_description).toBe('Updated description');
    // Fields not sent should remain unchanged
    expect(updated.system_prompt).toBe('You are a test agent.');
    expect(updated.pipeline_order).toBe(5);
  });

  test('PUT /api/auto/agents/:id returns 404 for non-existent agent', async ({ request }) => {
    const res = await request.put('/api/auto/agents/non-existent-id', {
      data: { display_name: 'Nope' },
    });
    expect(res.status()).toBe(404);
  });

  test('PATCH /api/auto/agents/:id/toggle toggles enabled state', async ({ request }) => {
    // Get a builtin agent
    const listRes = await request.get('/api/auto/agents');
    const agents = await listRes.json();
    const reviewer = agents.find((a: { name: string }) => a.name === 'reviewer');
    expect(reviewer).toBeTruthy();
    expect(reviewer.enabled).toBe(1);

    // Toggle off
    const toggleRes1 = await request.patch(`/api/auto/agents/${reviewer.id}/toggle`);
    expect(toggleRes1.status()).toBe(200);
    const toggled1 = await toggleRes1.json();
    expect(toggled1.enabled).toBe(0);

    // Toggle back on
    const toggleRes2 = await request.patch(`/api/auto/agents/${reviewer.id}/toggle`);
    expect(toggleRes2.status()).toBe(200);
    const toggled2 = await toggleRes2.json();
    expect(toggled2.enabled).toBe(1);
  });

  test('PATCH /api/auto/agents/:id/toggle returns 404 for non-existent agent', async ({ request }) => {
    const res = await request.patch('/api/auto/agents/non-existent-id/toggle');
    expect(res.status()).toBe(404);
  });

  test('DELETE /api/auto/agents/:id deletes custom agent', async ({ request }) => {
    // Create a custom agent
    const createRes = await request.post('/api/auto/agents', {
      data: {
        name: 'deletable_agent',
        display_name: 'Deletable',
        system_prompt: 'test',
        pipeline_order: 10,
      },
    });
    const created = await createRes.json();

    // Delete it
    const deleteRes = await request.delete(`/api/auto/agents/${created.id}`);
    expect(deleteRes.status()).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.success).toBe(true);

    // Verify it is gone
    const getRes = await request.get(`/api/auto/agents/${created.id}`);
    expect(getRes.status()).toBe(404);
  });

  test('DELETE /api/auto/agents/:id rejects builtin agent deletion', async ({ request }) => {
    const deleteRes = await request.delete('/api/auto/agents/builtin-developer');
    expect(deleteRes.status()).toBe(400);
    const data = await deleteRes.json();
    expect(data.error).toContain('built-in');
  });

  test('DELETE /api/auto/agents/:id returns 404 for non-existent agent', async ({ request }) => {
    const res = await request.delete('/api/auto/agents/non-existent-id');
    expect(res.status()).toBe(404);
  });
});
