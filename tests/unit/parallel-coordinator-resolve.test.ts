import { describe, it, expect } from 'vitest';

// Verify that parallel-coordinator imports async `spawn`, not blocking `spawnSync`
describe('resolveConflictsWithClaude', () => {
  it('uses async spawn instead of blocking spawnSync', async () => {
    const source = await import('fs/promises').then(fs =>
      fs.readFile('src/lib/autonomous/parallel-coordinator.ts', 'utf-8'),
    );

    // Should import spawn (not just spawnSync) from child_process
    expect(source).toMatch(/import\s+\{[^}]*\bspawn\b[^}]*\}\s+from\s+['"]child_process['"]/);

    // Should NOT use spawnSync anywhere in the file
    expect(source).not.toContain('spawnSync');
  });

  it('has a 60-second timeout (not 120s)', async () => {
    const source = await import('fs/promises').then(fs =>
      fs.readFile('src/lib/autonomous/parallel-coordinator.ts', 'utf-8'),
    );

    // Should contain 60_000 timeout
    expect(source).toContain('60_000');

    // Should NOT contain the old 120_000 timeout
    expect(source).not.toContain('120_000');
  });
});
