import { describe, it, expect } from 'vitest';
import { buildAgentContext } from '../../src/lib/autonomous/agent-context-builder';
import type { AutoAgent, AutoFinding } from '../../src/lib/autonomous/types';

function makeAgent(overrides: Partial<AutoAgent> = {}): AutoAgent {
  return {
    id: 'agent-1',
    name: 'developer',
    display_name: 'Developer',
    role_description: 'Implements code',
    system_prompt: 'You are a Senior Developer.',
    pipeline_order: 2,
    enabled: 1,
    is_builtin: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeFinding(overrides: Partial<AutoFinding> = {}): AutoFinding {
  return {
    id: 'finding-1',
    session_id: 'session-1',
    category: 'bug',
    priority: 'P1',
    title: 'Null pointer in login',
    description: 'User login crashes when email is empty',
    file_path: 'src/auth/login.ts',
    status: 'open',
    retry_count: 0,
    max_retries: 3,
    resolved_by_cycle_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildAgentContext', () => {
  it('includes agent system prompt', () => {
    const result = buildAgentContext(makeAgent(), {
      userPrompt: '',
      sessionState: '',
      previousOutputs: new Map(),
    });
    expect(result).toContain('You are a Senior Developer.');
  });

  it('includes user prompt when provided', () => {
    const result = buildAgentContext(makeAgent(), {
      userPrompt: 'Build a todo app',
      sessionState: '',
      previousOutputs: new Map(),
    });
    expect(result).toContain('[User Prompt]');
    expect(result).toContain('Build a todo app');
  });

  it('includes session state when provided', () => {
    const result = buildAgentContext(makeAgent(), {
      userPrompt: '',
      sessionState: '# Session State\nCycle: 5',
      previousOutputs: new Map(),
    });
    expect(result).toContain('[Session State]');
    expect(result).toContain('# Session State');
  });

  it('includes finding info when provided', () => {
    const result = buildAgentContext(makeAgent(), {
      userPrompt: '',
      sessionState: '',
      previousOutputs: new Map(),
      finding: makeFinding(),
    });
    expect(result).toContain('[Issue to Fix]');
    expect(result).toContain('Null pointer in login');
    expect(result).toContain('src/auth/login.ts');
  });

  it('includes finding without file_path', () => {
    const result = buildAgentContext(makeAgent(), {
      userPrompt: '',
      sessionState: '',
      previousOutputs: new Map(),
      finding: makeFinding({ file_path: null }),
    });
    expect(result).toContain('File: N/A');
  });

  it('includes previous agent outputs', () => {
    const outputs = new Map<string, string>();
    outputs.set('Product Designer', '{"features": []}');
    const result = buildAgentContext(makeAgent(), {
      userPrompt: '',
      sessionState: '',
      previousOutputs: outputs,
    });
    expect(result).toContain('[Product Designer Output]');
    expect(result).toContain('{"features": []}');
  });

  it('includes reviewer feedback when provided', () => {
    const result = buildAgentContext(makeAgent(), {
      userPrompt: '',
      sessionState: '',
      previousOutputs: new Map(),
      reviewFeedback: 'Fix the error handling in login.ts',
    });
    expect(result).toContain('[Reviewer Feedback]');
    expect(result).toContain('Fix the error handling in login.ts');
  });

  it('includes git diff when provided', () => {
    const result = buildAgentContext(makeAgent(), {
      userPrompt: '',
      sessionState: '',
      previousOutputs: new Map(),
      gitDiff: 'diff --git a/src/index.ts...',
    });
    expect(result).toContain('[Code Changes (git diff)]');
    expect(result).toContain('diff --git a/src/index.ts...');
  });

  it('combines all context parts in correct order', () => {
    const outputs = new Map<string, string>();
    outputs.set('Designer', 'spec output');
    const result = buildAgentContext(makeAgent(), {
      userPrompt: 'Build app',
      sessionState: 'State info',
      previousOutputs: outputs,
      finding: makeFinding(),
      reviewFeedback: 'Fix bugs',
      gitDiff: 'some diff',
    });
    const systemIdx = result.indexOf('You are a Senior Developer.');
    const userIdx = result.indexOf('[User Prompt]');
    const stateIdx = result.indexOf('[Session State]');
    const findingIdx = result.indexOf('[Issue to Fix]');
    const outputIdx = result.indexOf('[Designer Output]');
    const feedbackIdx = result.indexOf('[Reviewer Feedback]');
    const diffIdx = result.indexOf('[Code Changes');
    expect(systemIdx).toBeLessThan(userIdx);
    expect(userIdx).toBeLessThan(stateIdx);
    expect(stateIdx).toBeLessThan(findingIdx);
    expect(findingIdx).toBeLessThan(outputIdx);
    expect(outputIdx).toBeLessThan(feedbackIdx);
    expect(feedbackIdx).toBeLessThan(diffIdx);
  });

  it('omits empty sections', () => {
    const result = buildAgentContext(makeAgent(), {
      userPrompt: '',
      sessionState: '',
      previousOutputs: new Map(),
    });
    expect(result).not.toContain('[User Prompt]');
    expect(result).not.toContain('[Session State]');
    expect(result).not.toContain('[Issue to Fix]');
    expect(result).not.toContain('[Reviewer Feedback]');
    expect(result).not.toContain('[Code Changes');
    expect(result).toBe('You are a Senior Developer.');
  });
});
