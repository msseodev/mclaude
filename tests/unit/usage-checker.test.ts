import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWaitTimeMs } from '@/lib/autonomous/usage-checker';

// Mock child_process and fs to avoid actually running Swift
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import { execFile } from 'child_process';
const mockExecFile = vi.mocked(execFile);

// Import checkUsage after mocks are set up
import { checkUsage } from '@/lib/autonomous/usage-checker';

function mockSwiftOutput(stdout: string, exitCode = 0) {
  mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
    const callback = cb as (err: Error | null, stdout: string, stderr: string) => void;
    if (exitCode !== 0) {
      const err = new Error(`Command failed`) as Error & { code: number };
      err.code = exitCode;
      callback(err, '', stdout);
    } else {
      callback(null, stdout, '');
    }
    return { unref: vi.fn() } as unknown as ReturnType<typeof execFile>;
  });
}

describe('usage-checker', () => {
  describe('getWaitTimeMs', () => {
    it('returns correct ms with 60s buffer for a future time', () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000);
      const waitMs = getWaitTimeMs(futureDate);
      expect(waitMs).toBeGreaterThan(30 * 60 * 1000);
      expect(waitMs).toBeLessThanOrEqual(30 * 60 * 1000 + 61 * 1000);
    });

    it('returns at least 60s for a time in the past', () => {
      const pastDate = new Date(Date.now() - 10 * 60 * 1000);
      const waitMs = getWaitTimeMs(pastDate);
      expect(waitMs).toBe(60 * 1000);
    });

    it('caps at 5 hours for a far-future reset time', () => {
      const farFuture = new Date(Date.now() + 10 * 60 * 60 * 1000);
      const waitMs = getWaitTimeMs(farFuture);
      expect(waitMs).toBe(5 * 60 * 60 * 1000);
    });

    it('returns 60s for Invalid Date input', () => {
      const invalidDate = new Date('invalid');
      const waitMs = getWaitTimeMs(invalidDate);
      expect(waitMs).toBe(60 * 1000);
    });
  });

  describe('checkUsage', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('parses valid Swift output with resets_at', async () => {
      mockSwiftOutput('42|2026-04-03T02:00:00.000Z');
      const result = await checkUsage('sk-test', 'org-123');
      expect(result.utilization).toBe(42);
      expect(result.resetsAt).toEqual(new Date('2026-04-03T02:00:00.000Z'));
    });

    it('parses output without resets_at', async () => {
      mockSwiftOutput('10|');
      const result = await checkUsage('sk-test', 'org-123');
      expect(result.utilization).toBe(10);
      expect(result.resetsAt).toBeNull();
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

    it('throws when Swift script fails', async () => {
      mockSwiftOutput('ERROR:something went wrong', 1);
      await expect(checkUsage('sk-test', 'org-123')).rejects.toThrow();
    });

    it('throws on unexpected output format', async () => {
      mockSwiftOutput('notanumber|');
      await expect(checkUsage('sk-test', 'org-123')).rejects.toThrow('Unexpected usage output');
    });
  });
});
