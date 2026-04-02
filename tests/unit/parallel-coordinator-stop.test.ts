import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Structural test: verify that WorkerPool.stop() aborts active PipelineExecutors
 * by inspecting the source code of parallel-coordinator.ts.
 */
describe('WorkerPool.stop() aborts active executors', () => {
  const srcPath = path.resolve(__dirname, '../../src/lib/autonomous/parallel-coordinator.ts');
  const source = fs.readFileSync(srcPath, 'utf-8');

  it('should have an activeExecutors field tracking executors', () => {
    expect(source).toContain('activeExecutors');
  });

  it('should iterate and abort active executors in stop()', () => {
    // Extract the stop() method body
    const stopMatch = source.match(/stop\(\)[^{]*\{([\s\S]*?)\n  \}/);
    expect(stopMatch).not.toBeNull();
    const stopBody = stopMatch![1];

    expect(stopBody).toContain('activeExecutors');
    expect(stopBody).toContain('.abort()');
  });
});
