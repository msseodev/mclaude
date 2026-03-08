import { describe, it, expect } from 'vitest';
import { parseQACounts } from '../../src/lib/autonomous/cycle-engine';
import { parseQAOutput } from '../../src/lib/autonomous/pipeline-executor';

describe('parseQACounts', () => {
  it('parses JSON summary format', () => {
    const input = '{"summary": {"passed": 5, "failed": 2, "total": 7}}';
    const result = parseQACounts(input);
    expect(result).toEqual({ passed: 5, failed: 2, total: 7 });
  });

  it('parses JSON summary embedded in surrounding text', () => {
    const input = 'Some output... {"summary": {"passed": 3, "failed": 0, "total": 3}} ...more text';
    const result = parseQACounts(input);
    expect(result).toEqual({ passed: 3, failed: 0, total: 3 });
  });

  it('falls back to regex for text-based test output', () => {
    const input = '10 passed, 2 failed, 12 total';
    const result = parseQACounts(input);
    expect(result).toEqual({ passed: 10, failed: 2, total: 12 });
  });

  it('returns nulls when no match is found', () => {
    const input = 'no test results here';
    const result = parseQACounts(input);
    expect(result).toEqual({ passed: null, failed: null, total: null });
  });

  it('prefers JSON summary over regex when both are present', () => {
    const input = '5 passed, 1 failed, 6 total {"summary": {"passed": 10, "failed": 0, "total": 10}}';
    const result = parseQACounts(input);
    expect(result).toEqual({ passed: 10, failed: 0, total: 10 });
  });

  it('falls back to regex when JSON is malformed', () => {
    const input = '{"summary": invalid json} 3 passed, 1 failed, 4 total';
    const result = parseQACounts(input);
    expect(result).toEqual({ passed: 3, failed: 1, total: 4 });
  });

  it('handles JSON summary with non-number values by returning null for those fields', () => {
    const input = '{"summary": {"passed": "many", "failed": 0, "total": 10}}';
    const result = parseQACounts(input);
    expect(result).toEqual({ passed: null, failed: 0, total: 10 });
  });

  it('parses JSON summary when preceded by other JSON objects', () => {
    const input = '{"result": "ok"} {"summary": {"passed": 5, "failed": 1, "total": 6}}';
    const result = parseQACounts(input);
    expect(result).toEqual({ passed: 5, failed: 1, total: 6 });
  });
});

describe('parseQAOutput', () => {
  it('parses JSON summary and determines pass/fail', () => {
    const input = '{"summary": {"passed": 5, "failed": 0, "total": 5}}';
    const result = parseQAOutput(input);
    expect(result).toEqual({ passed: true, testOutput: input });
  });

  it('detects failures from JSON summary', () => {
    const input = '{"summary": {"passed": 4, "failed": 2, "total": 6}}';
    const result = parseQAOutput(input);
    expect(result).toEqual({ passed: false, testOutput: input });
  });

  it('parses JSON summary when preceded by other JSON objects', () => {
    const input = '{"result": "ok"} {"summary": {"passed": 5, "failed": 1, "total": 6}}';
    const result = parseQAOutput(input);
    expect(result).toEqual({ passed: false, testOutput: input });
  });

  it('returns passed true when no summary JSON is found', () => {
    const input = 'no test results here';
    const result = parseQAOutput(input);
    expect(result).toEqual({ passed: true, testOutput: input });
  });
});
