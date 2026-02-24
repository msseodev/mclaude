import { describe, it, expect } from 'vitest';
import { parseReviewOutput, parseQAOutput } from '../../src/lib/autonomous/pipeline-executor';

describe('parseReviewOutput', () => {
  it('parses approved review', () => {
    const output = '{"approved": true, "issues": [], "summary": "LGTM"}';
    const result = parseReviewOutput(output);
    expect(result.approved).toBe(true);
  });

  it('parses rejected review with issues', () => {
    const output = JSON.stringify({
      approved: false,
      issues: [
        { severity: 'critical', file: 'src/index.ts', description: 'Missing error handling', suggestion: 'Add try-catch' }
      ],
      summary: 'Needs fixes',
    });
    const result = parseReviewOutput(output);
    expect(result.approved).toBe(false);
    expect(result.feedback).toContain('Missing error handling');
  });

  it('extracts JSON from mixed output', () => {
    const output = 'Here is my review:\n\n```json\n{"approved": false, "issues": [{"severity": "major", "description": "Bug found"}], "summary": "Fix needed"}\n```\n\nPlease fix these issues.';
    const result = parseReviewOutput(output);
    expect(result.approved).toBe(false);
    expect(result.feedback).toContain('Bug found');
  });

  it('defaults to approved on malformed output', () => {
    const result = parseReviewOutput('This is not JSON at all');
    expect(result.approved).toBe(true);
    expect(result.feedback).toBe('');
  });

  it('defaults to approved on empty output', () => {
    const result = parseReviewOutput('');
    expect(result.approved).toBe(true);
  });

  it('uses summary as feedback when no issues array', () => {
    const output = '{"approved": false, "summary": "Multiple problems found"}';
    const result = parseReviewOutput(output);
    expect(result.approved).toBe(false);
    expect(result.feedback).toBe('Multiple problems found');
  });
});

describe('parseQAOutput', () => {
  it('parses passing test results', () => {
    const output = JSON.stringify({
      summary: { total: 10, passed: 10, failed: 0, skipped: 0 },
      failures: [],
    });
    const result = parseQAOutput(output);
    expect(result.passed).toBe(true);
  });

  it('parses failing test results', () => {
    const output = JSON.stringify({
      summary: { total: 10, passed: 8, failed: 2, skipped: 0 },
      failures: [{ test_name: 'login test', error_message: 'assertion failed' }],
    });
    const result = parseQAOutput(output);
    expect(result.passed).toBe(false);
    expect(result.testOutput).toContain('login test');
  });

  it('extracts JSON from mixed output', () => {
    const output = 'Running tests...\n\n{"summary": {"total": 5, "passed": 5, "failed": 0}}\n\nDone.';
    const result = parseQAOutput(output);
    expect(result.passed).toBe(true);
  });

  it('defaults to passed on malformed output', () => {
    const result = parseQAOutput('All tests passed!');
    expect(result.passed).toBe(true);
  });

  it('defaults to passed on empty output', () => {
    const result = parseQAOutput('');
    expect(result.passed).toBe(true);
  });
});
