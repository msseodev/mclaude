import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

// Test that StateManager uses atomic write (temp + rename)
describe('StateManager atomic write', () => {
  it('writes via temp file then renames', async () => {
    const writeFileSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    const renameSpy = vi.spyOn(fs, 'rename').mockResolvedValue(undefined);
    const mkdirSpy = vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);

    const { StateManager } = await import('@/lib/autonomous/state-manager');
    const sm = new StateManager('/tmp/test-project');

    await sm.writeState(
      { id: 's1', target_project: '/tmp/test', status: 'running', total_cycles: 1, total_cost_usd: 0, config: null, created_at: '', updated_at: '' } as any,
      [],
      [],
    );

    // Should write to .tmp first
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('.tmp'),
      expect.any(String),
      'utf-8'
    );
    // Then rename
    expect(renameSpy).toHaveBeenCalledWith(
      expect.stringContaining('.tmp'),
      expect.not.stringContaining('.tmp')
    );

    writeFileSpy.mockRestore();
    renameSpy.mockRestore();
    mkdirSpy.mockRestore();
  });
});
