import { describe, it, expect } from 'vitest';
import { parseReviewOutput, parseQAOutput, parseDeveloperOutput } from '../../src/lib/autonomous/pipeline-executor';

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

describe('parseDeveloperOutput', () => {
  it('detects BLOCKER: pattern', () => {
    const output = 'I tried to implement the feature but:\n\nBLOCKER: The spec requires a database schema that conflicts with existing tables';
    const result = parseDeveloperOutput(output);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe('The spec requires a database schema that conflicts with existing tables');
  });

  it('detects BLOCKED: pattern', () => {
    const output = 'BLOCKED: Missing API endpoint definition in the spec';
    const result = parseDeveloperOutput(output);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe('Missing API endpoint definition in the spec');
  });

  it('detects CANNOT IMPLEMENT: pattern', () => {
    const output = 'CANNOT IMPLEMENT: The required dependency is incompatible with the current Node version';
    const result = parseDeveloperOutput(output);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe('The required dependency is incompatible with the current Node version');
  });

  it('detects JSON structured blocker', () => {
    const output = 'Here is my status:\n\n{"blocked": true, "reason": "No authentication module available"}';
    const result = parseDeveloperOutput(output);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe('No authentication module available');
  });

  it('returns blocked false for normal developer output', () => {
    const output = 'I implemented the feature successfully. All files have been updated and tests pass.';
    const result = parseDeveloperOutput(output);
    expect(result.blocked).toBe(false);
    expect(result.blockerReason).toBe('');
  });

  it('does not trigger on lowercase "blocker" in a sentence', () => {
    const output = 'There was no blocker during implementation. Everything went smoothly and the feature is complete.';
    const result = parseDeveloperOutput(output);
    expect(result.blocked).toBe(false);
    expect(result.blockerReason).toBe('');
  });

  it('detects IMPLEMENTATION FAILED: pattern', () => {
    const output = 'IMPLEMENTATION FAILED: Build errors in TypeScript compilation';
    const result = parseDeveloperOutput(output);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe('Build errors in TypeScript compilation');
  });

  it('detects SPEC ISSUE: pattern', () => {
    const output = 'SPEC ISSUE: The acceptance criteria are contradictory';
    const result = parseDeveloperOutput(output);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe('The acceptance criteria are contradictory');
  });

  it('handles JSON blocker with blocker_reason field', () => {
    const output = '{"blocked": true, "blocker_reason": "Missing config file"}';
    const result = parseDeveloperOutput(output);
    expect(result.blocked).toBe(true);
    expect(result.blockerReason).toBe('Missing config file');
  });

  it('returns blocked false when JSON has blocked=false', () => {
    const output = '{"blocked": false, "reason": ""}';
    const result = parseDeveloperOutput(output);
    expect(result.blocked).toBe(false);
  });
});
