import { describe, it, expect } from 'vitest';
import { FindingExtractor } from '@/lib/autonomous/finding-extractor';
import type { AutoFinding } from '@/lib/autonomous/types';

function makeFinding(overrides: Partial<AutoFinding> = {}): AutoFinding {
  return {
    id: 'finding-1',
    session_id: 'session-1',
    category: 'bug',
    priority: 'P2',
    title: 'Default finding title',
    description: 'Default description',
    file_path: null,
    status: 'open',
    retry_count: 0,
    max_retries: 3,
    resolved_by_cycle_id: null,
    failure_history: null,
    project_path: null,
    resolution_summary: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeClaudeOutput(findings: Array<{ title: string; category?: string; priority?: string; description?: string; file_path?: string | null }>): string {
  const json = JSON.stringify({
    findings: findings.map(f => ({
      title: f.title,
      category: f.category ?? 'bug',
      priority: f.priority ?? 'P2',
      description: f.description ?? 'A description',
      file_path: f.file_path ?? null,
    })),
  });
  return '```json\n' + json + '\n```';
}

describe('FindingExtractor', () => {
  const extractor = new FindingExtractor();

  describe('extract() basic functionality', () => {
    it('should return findings from valid JSON output', () => {
      const output = makeClaudeOutput([
        { title: 'Fix memory leak in worker pool', category: 'bug', priority: 'P1' },
        { title: 'Add error boundary to dashboard', category: 'improvement', priority: 'P2' },
      ]);

      const result = extractor.extract(output);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Fix memory leak in worker pool');
      expect(result[0].category).toBe('bug');
      expect(result[0].priority).toBe('P1');
      expect(result[1].title).toBe('Add error boundary to dashboard');
      expect(result[1].category).toBe('improvement');
    });
  });

  describe('extract() deduplicates against existingFindings (same session)', () => {
    it('should filter out findings that match existing ones by exact title', () => {
      const output = makeClaudeOutput([
        { title: 'Fix memory leak', category: 'bug' },
        { title: 'New feature idea', category: 'idea' },
      ]);

      const existing: AutoFinding[] = [
        makeFinding({ id: 'f1', title: 'Fix memory leak', status: 'open' }),
      ];

      const result = extractor.extract(output, existing);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('New feature idea');
    });
  });

  describe('extract() deduplicates against crossSessionFindings (resolved)', () => {
    it('should filter out findings that were resolved in a previous session', () => {
      const output = makeClaudeOutput([
        { title: 'Fix memory leak in worker pool', category: 'bug' },
        { title: 'Brand new issue', category: 'bug' },
      ]);

      const crossSession: AutoFinding[] = [
        makeFinding({
          id: 'cs-f1',
          session_id: 'old-session',
          title: 'Fix memory leak in worker pool',
          status: 'resolved',
          resolved_by_cycle_id: 'old-cycle-1',
        }),
      ];

      const result = extractor.extract(output, [], crossSession);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Brand new issue');
    });
  });

  describe('extract() deduplicates against crossSessionFindings (wont_fix)', () => {
    it('should filter out findings that were marked wont_fix in a previous session', () => {
      const output = makeClaudeOutput([
        { title: 'Flaky test in CI pipeline', category: 'test_failure' },
        { title: 'Performance optimization needed', category: 'performance' },
      ]);

      const crossSession: AutoFinding[] = [
        makeFinding({
          id: 'cs-f2',
          session_id: 'old-session',
          title: 'Flaky test in CI pipeline',
          status: 'wont_fix',
        }),
      ];

      const result = extractor.extract(output, [], crossSession);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Performance optimization needed');
    });
  });

  describe('extract() does NOT deduplicate when titles are different (cross-session)', () => {
    it('should keep findings whose titles do not match cross-session findings', () => {
      const output = makeClaudeOutput([
        { title: 'Completely new finding', category: 'bug' },
        { title: 'Another new finding', category: 'improvement' },
      ]);

      const crossSession: AutoFinding[] = [
        makeFinding({
          id: 'cs-f3',
          session_id: 'old-session',
          title: 'Totally different issue from before',
          status: 'resolved',
        }),
      ];

      const result = extractor.extract(output, [], crossSession);
      expect(result).toHaveLength(2);
    });
  });

  describe('extract() deduplicates when titles are similar but not exact (Dice > 0.8)', () => {
    it('should filter out findings with similar titles (Dice coefficient > 0.8)', () => {
      const output = makeClaudeOutput([
        { title: 'Fix memory leak in the worker pool module', category: 'bug' },
        { title: 'Unrelated finding about security', category: 'security' },
      ]);

      // Very similar title (differs by minor wording)
      const crossSession: AutoFinding[] = [
        makeFinding({
          id: 'cs-f4',
          session_id: 'old-session',
          title: 'Fix memory leak in worker pool module',
          status: 'resolved',
        }),
      ];

      const result = extractor.extract(output, [], crossSession);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Unrelated finding about security');
    });
  });

  describe('extract() works with all three params as empty arrays', () => {
    it('should return all valid findings when existing and cross-session arrays are empty', () => {
      const output = makeClaudeOutput([
        { title: 'Finding one', category: 'bug' },
        { title: 'Finding two', category: 'improvement' },
      ]);

      const result = extractor.extract(output, [], []);
      expect(result).toHaveLength(2);
    });
  });

  describe('extract() handles crossSessionFindings as undefined (backward compat)', () => {
    it('should work when crossSessionFindings is not provided', () => {
      const output = makeClaudeOutput([
        { title: 'Some finding', category: 'bug' },
      ]);

      // Call with only two params (backward compatible)
      const result = extractor.extract(output, []);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Some finding');
    });

    it('should work when both optional params are omitted', () => {
      const output = makeClaudeOutput([
        { title: 'Another finding', category: 'improvement' },
      ]);

      const result = extractor.extract(output);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Another finding');
    });
  });

  describe('extract() combined same-session and cross-session dedup', () => {
    it('should deduplicate against both existing and cross-session findings simultaneously', () => {
      const output = makeClaudeOutput([
        { title: 'Already in current session', category: 'bug' },
        { title: 'Already resolved in old session', category: 'bug' },
        { title: 'Truly new finding', category: 'improvement' },
      ]);

      const existing: AutoFinding[] = [
        makeFinding({ id: 'e1', title: 'Already in current session', status: 'open' }),
      ];

      const crossSession: AutoFinding[] = [
        makeFinding({
          id: 'cs1',
          session_id: 'old-session',
          title: 'Already resolved in old session',
          status: 'resolved',
        }),
      ];

      const result = extractor.extract(output, existing, crossSession);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Truly new finding');
    });
  });
});
