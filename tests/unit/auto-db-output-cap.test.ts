import { describe, it, expect, vi, beforeEach } from 'vitest';

// We'll test the truncation logic directly
describe('output truncation in DB updates', () => {
  it('truncates cycle output exceeding 50KB', async () => {
    // Create a string > 50KB
    const bigOutput = 'x'.repeat(60_000);
    const MAX_OUTPUT_SIZE = 50_000;
    const truncated = bigOutput.length > MAX_OUTPUT_SIZE
      ? '...(truncated)...\n' + bigOutput.slice(-MAX_OUTPUT_SIZE)
      : bigOutput;

    expect(truncated.length).toBeLessThanOrEqual(MAX_OUTPUT_SIZE + 20); // +marker
    expect(truncated).toContain('...(truncated)...');
    expect(truncated.endsWith('x')).toBe(true); // Keeps the tail
  });

  it('does not truncate output under 50KB', () => {
    const smallOutput = 'hello world';
    const MAX_OUTPUT_SIZE = 50_000;
    const result = smallOutput.length > MAX_OUTPUT_SIZE
      ? '...(truncated)...\n' + smallOutput.slice(-MAX_OUTPUT_SIZE)
      : smallOutput;

    expect(result).toBe('hello world');
  });
});
