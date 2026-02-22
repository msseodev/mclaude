import { test, expect } from '@playwright/test';

test.describe('API Routes', () => {
  test.describe('GET /api/prompts', () => {
    test('should return array of prompts', async ({ request }) => {
      const res = await request.get('/api/prompts');
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  test.describe('POST /api/prompts', () => {
    test('should create a prompt', async ({ request }) => {
      const res = await request.post('/api/prompts', {
        data: { title: 'API Test', content: 'Test content' },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.title).toBe('API Test');
      expect(body.content).toBe('Test content');
      expect(body.id).toBeDefined();
      expect(body.status).toBe('pending');

      // Cleanup
      await request.delete(`/api/prompts/${body.id}`);
    });

    test('should return 400 when title is missing', async ({ request }) => {
      const res = await request.post('/api/prompts', {
        data: { content: 'No title' },
      });
      expect(res.status()).toBe(400);
    });

    test('should return 400 when content is missing', async ({ request }) => {
      const res = await request.post('/api/prompts', {
        data: { title: 'No content' },
      });
      expect(res.status()).toBe(400);
    });
  });

  test.describe('PUT /api/prompts/:id', () => {
    test('should update a prompt', async ({ request }) => {
      // Create prompt
      const createRes = await request.post('/api/prompts', {
        data: { title: 'Original', content: 'Content' },
      });
      const created = await createRes.json();

      // Update
      const updateRes = await request.put(`/api/prompts/${created.id}`, {
        data: { title: 'Updated' },
      });
      expect(updateRes.ok()).toBe(true);
      const updated = await updateRes.json();
      expect(updated.title).toBe('Updated');
      expect(updated.content).toBe('Content');

      // Cleanup
      await request.delete(`/api/prompts/${created.id}`);
    });

    test('should return 404 for non-existent prompt', async ({ request }) => {
      const res = await request.put('/api/prompts/non-existent-id', {
        data: { title: 'Nope' },
      });
      expect(res.status()).toBe(404);
    });
  });

  test.describe('DELETE /api/prompts/:id', () => {
    test('should delete a prompt', async ({ request }) => {
      const createRes = await request.post('/api/prompts', {
        data: { title: 'Delete Me', content: 'Content' },
      });
      const created = await createRes.json();

      const deleteRes = await request.delete(`/api/prompts/${created.id}`);
      expect(deleteRes.ok()).toBe(true);

      // Verify it's gone
      const getRes = await request.get(`/api/prompts/${created.id}`);
      expect(getRes.status()).toBe(404);
    });

    test('should return 404 for non-existent prompt', async ({ request }) => {
      const res = await request.delete('/api/prompts/non-existent-id');
      expect(res.status()).toBe(404);
    });
  });

  test.describe('PUT /api/prompts/reorder', () => {
    test('should reorder prompts', async ({ request }) => {
      // Create 3 prompts
      const r1 = await request.post('/api/prompts', {
        data: { title: 'First', content: 'C1' },
      });
      const r2 = await request.post('/api/prompts', {
        data: { title: 'Second', content: 'C2' },
      });
      const r3 = await request.post('/api/prompts', {
        data: { title: 'Third', content: 'C3' },
      });
      const p1 = await r1.json();
      const p2 = await r2.json();
      const p3 = await r3.json();

      // Reverse order
      const reorderRes = await request.put('/api/prompts/reorder', {
        data: { orderedIds: [p3.id, p2.id, p1.id] },
      });
      expect(reorderRes.ok()).toBe(true);

      // Verify order
      const listRes = await request.get('/api/prompts');
      const prompts = await listRes.json();
      const testPrompts = prompts.filter((p: { id: string }) =>
        [p1.id, p2.id, p3.id].includes(p.id)
      );
      expect(testPrompts[0].title).toBe('Third');
      expect(testPrompts[1].title).toBe('Second');
      expect(testPrompts[2].title).toBe('First');

      // Cleanup
      await request.delete(`/api/prompts/${p1.id}`);
      await request.delete(`/api/prompts/${p2.id}`);
      await request.delete(`/api/prompts/${p3.id}`);
    });
  });

  test.describe('GET /api/settings', () => {
    test('should return settings object', async ({ request }) => {
      const res = await request.get('/api/settings');
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.working_directory).toBeDefined();
      expect(body.claude_binary).toBeDefined();
    });
  });

  test.describe('PUT /api/settings', () => {
    test('should update settings', async ({ request }) => {
      // Save current settings
      const currentRes = await request.get('/api/settings');
      const current = await currentRes.json();

      const res = await request.put('/api/settings', {
        data: { claude_binary: 'test-binary' },
      });
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.claude_binary).toBe('test-binary');

      // Restore
      await request.put('/api/settings', {
        data: { claude_binary: current.claude_binary },
      });
    });
  });

  test.describe('GET /api/run/status', () => {
    test('should return run status', async ({ request }) => {
      const res = await request.get('/api/run/status');
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(body.status).toBeDefined();
      expect(body.completedCount).toBeDefined();
      expect(body.totalCount).toBeDefined();
    });
  });

  test.describe('GET /api/history', () => {
    test('should return execution history array', async ({ request }) => {
      const res = await request.get('/api/history');
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test('should support limit and offset params', async ({ request }) => {
      const res = await request.get('/api/history?limit=5&offset=0');
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeLessThanOrEqual(5);
    });
  });

  test.describe('PATCH /api/run', () => {
    test('should return 500 for pause without active session', async ({ request }) => {
      const res = await request.patch('/api/run', {
        data: { action: 'pause' },
      });
      // Either succeeds (if session exists) or errors
      expect([200, 500]).toContain(res.status());
    });

    test('should return 400 for invalid action', async ({ request }) => {
      const res = await request.patch('/api/run', {
        data: { action: 'invalid' },
      });
      expect(res.status()).toBe(400);
    });
  });
});
