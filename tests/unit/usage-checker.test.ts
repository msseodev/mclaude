import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWaitTimeMs, checkUsage } from '@/lib/autonomous/usage-checker';

describe('usage-checker', () => {
  describe('getWaitTimeMs', () => {
    it('returns correct ms with 60s buffer for a future time', () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
      const waitMs = getWaitTimeMs(futureDate);
      // Should be ~30 min + 60s buffer
      expect(waitMs).toBeGreaterThan(30 * 60 * 1000);
      expect(waitMs).toBeLessThanOrEqual(30 * 60 * 1000 + 61 * 1000);
    });

    it('returns at least 60s for a time in the past', () => {
      const pastDate = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
      const waitMs = getWaitTimeMs(pastDate);
      expect(waitMs).toBe(60 * 1000);
    });
  });

  describe('checkUsage', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('parses valid response JSON', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          five_hour: {
            utilization: 42,
            resets_at: '2026-04-03T02:00:00.000Z',
          },
        }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const result = await checkUsage('sk-test', 'org-123');
      expect(result.utilization).toBe(42);
      expect(result.resetsAt).toEqual(new Date('2026-04-03T02:00:00.000Z'));

      expect(fetch).toHaveBeenCalledWith(
        'https://claude.ai/api/organizations/org-123/usage',
        {
          headers: {
            'Cookie': 'sessionKey=sk-test',
            'Accept': 'application/json',
          },
        },
      );
    });

    it('throws on invalid orgId with path traversal', async () => {
      await expect(checkUsage('sk-test', '../evil')).rejects.toThrow(
        'Invalid orgId: contains path traversal characters',
      );
    });

    it('throws on invalid orgId with backslash', async () => {
      await expect(checkUsage('sk-test', '..\\evil')).rejects.toThrow(
        'Invalid orgId: contains path traversal characters',
      );
    });

    it('throws on non-ok HTTP response', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: async () => ({}),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      await expect(checkUsage('sk-test', 'org-123')).rejects.toThrow(
        'Usage API returned 401',
      );
    });

    it('throws on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      await expect(checkUsage('sk-test', 'org-123')).rejects.toThrow('Network error');
    });

    it('throws on unexpected response format', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ unexpected: true }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      await expect(checkUsage('sk-test', 'org-123')).rejects.toThrow(
        'Unexpected usage API response format',
      );
    });

    it('returns null resetsAt when not present in response', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({
          five_hour: {
            utilization: 10,
          },
        }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const result = await checkUsage('sk-test', 'org-123');
      expect(result.utilization).toBe(10);
      expect(result.resetsAt).toBeNull();
    });
  });
});
