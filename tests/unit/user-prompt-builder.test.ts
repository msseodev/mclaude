import { describe, it, expect } from 'vitest';
import { buildUserPrompt } from '../../src/lib/autonomous/user-prompt-builder';
import type { AutoSession, AutoUserPrompt } from '../../src/lib/autonomous/types';

function makeSession(overrides: Partial<AutoSession> = {}): AutoSession {
  return {
    id: 'session-1',
    target_project: '/test/project',
    status: 'running',
    total_cycles: 0,
    total_cost_usd: 0,
    config: null,
    initial_prompt: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makePrompt(content: string, cycle: number): AutoUserPrompt {
  return {
    id: `prompt-${cycle}`,
    session_id: 'session-1',
    content,
    added_at_cycle: cycle,
    created_at: new Date().toISOString(),
  };
}

describe('buildUserPrompt', () => {
  it('returns empty string when no initial prompt and no mid-session prompts', () => {
    const result = buildUserPrompt(makeSession(), []);
    expect(result).toBe('');
  });

  it('includes initial prompt only', () => {
    const result = buildUserPrompt(
      makeSession({ initial_prompt: 'Build a todo app with React' }),
      []
    );
    expect(result).toContain('## Project Goal');
    expect(result).toContain('Build a todo app with React');
    expect(result).not.toContain('Additional Instructions');
  });

  it('includes mid-session prompts only', () => {
    const result = buildUserPrompt(makeSession(), [
      makePrompt('Add dark mode', 3),
      makePrompt('Add drag and drop', 7),
    ]);
    expect(result).not.toContain('Project Goal');
    expect(result).toContain('## Additional Instructions');
    expect(result).toContain('[Cycle 3] Add dark mode');
    expect(result).toContain('[Cycle 7] Add drag and drop');
  });

  it('includes both initial and mid-session prompts', () => {
    const result = buildUserPrompt(
      makeSession({ initial_prompt: 'Build a blog platform' }),
      [
        makePrompt('Add tags', 2),
        makePrompt('Add search', 5),
      ]
    );
    expect(result).toContain('## Project Goal');
    expect(result).toContain('Build a blog platform');
    expect(result).toContain('## Additional Instructions');
    expect(result).toContain('[Cycle 2] Add tags');
    expect(result).toContain('[Cycle 5] Add search');
    // Initial prompt should come before additional instructions
    const goalIdx = result.indexOf('Project Goal');
    const additionalIdx = result.indexOf('Additional Instructions');
    expect(goalIdx).toBeLessThan(additionalIdx);
  });

  it('preserves chronological order of mid-session prompts', () => {
    const result = buildUserPrompt(makeSession(), [
      makePrompt('First', 1),
      makePrompt('Second', 5),
      makePrompt('Third', 10),
    ]);
    const firstIdx = result.indexOf('[Cycle 1]');
    const secondIdx = result.indexOf('[Cycle 5]');
    const thirdIdx = result.indexOf('[Cycle 10]');
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });
});
