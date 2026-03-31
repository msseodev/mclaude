import { describe, it, expect } from 'vitest';
import { KnowledgeExtractor } from '@/lib/autonomous/knowledge-extractor';
import type { AutoFinding } from '@/lib/autonomous/types';

function makeFinding(overrides: Partial<AutoFinding> = {}): AutoFinding {
  return {
    id: 'finding-1',
    session_id: 'session-1',
    category: 'bug',
    priority: 'P1',
    title: 'Default finding title',
    description: 'Default description of the finding',
    file_path: 'src/app.ts',
    status: 'open',
    retry_count: 0,
    max_retries: 3,
    resolved_by_cycle_id: null,
    failure_history: null,
    project_path: '/test/project',
    resolution_summary: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

describe('KnowledgeExtractor', () => {
  const extractor = new KnowledgeExtractor();

  describe('extractFromReviewerOutput', () => {
    it('extracts conventions from reviewer issues with convention keywords', () => {
      const structuredData = {
        approved: false,
        issues: [
          {
            severity: 'warning',
            description: 'You should always use const for immutable bindings',
            suggestion: 'Replace let with const where possible',
          },
          {
            severity: 'error',
            description: 'Must follow the established naming convention for components',
            suggestion: 'Use PascalCase for React components',
          },
        ],
      };

      const result = extractor.extractFromReviewerOutput('some output', structuredData);

      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('coding_convention');
      expect(result[0].source_agent).toBe('Reviewer');
      expect(result[0].content).toContain('always use const');
      expect(result[0].content).toContain('Replace let with const');
      expect(result[1].content).toContain('naming convention');
    });

    it('returns empty array when no structured data', () => {
      const result = extractor.extractFromReviewerOutput('some output', null);
      expect(result).toEqual([]);
    });

    it('returns empty array when issues have no convention keywords', () => {
      const structuredData = {
        approved: true,
        issues: [
          {
            severity: 'info',
            description: 'Consider adding a log statement here',
          },
          {
            severity: 'warning',
            description: 'This variable is unused',
          },
        ],
      };

      const result = extractor.extractFromReviewerOutput('some output', structuredData);
      expect(result).toEqual([]);
    });

    it('limits to max 3 entries per call', () => {
      const structuredData = {
        approved: false,
        issues: [
          { severity: 'warning', description: 'You should always use strict mode' },
          { severity: 'warning', description: 'Must never use any type' },
          { severity: 'error', description: 'Convention requires semicolons' },
          { severity: 'error', description: 'Must always handle errors' },
          { severity: 'warning', description: 'Should always validate inputs' },
        ],
      };

      const result = extractor.extractFromReviewerOutput('some output', structuredData);
      expect(result).toHaveLength(3);
    });

    it('extracts from issues with suggestion field', () => {
      const structuredData = {
        approved: false,
        issues: [
          {
            severity: 'warning',
            description: 'Inconsistent error handling',
            suggestion: 'You should always wrap async calls in try-catch for consistent error handling',
          },
        ],
      };

      const result = extractor.extractFromReviewerOutput('some output', structuredData);

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('coding_convention');
      expect(result[0].content).toContain('Inconsistent error handling');
      expect(result[0].content).toContain('wrap async calls in try-catch');
    });
  });

  describe('extractFromWontFix', () => {
    it('extracts limitation from finding with failure history', () => {
      const history = [
        { cycle_id: 'c1', approach: 'tried A', failure_reason: 'dependency issue', timestamp: '2026-03-01T00:00:00Z' },
        { cycle_id: 'c2', approach: 'tried B', failure_reason: 'third-party API limitation', timestamp: '2026-03-01T01:00:00Z' },
      ];
      const finding = makeFinding({
        status: 'wont_fix',
        title: 'Cannot fix external API timeout',
        failure_history: JSON.stringify(history),
      });

      const result = extractor.extractFromWontFix(finding);

      expect(result).not.toBeNull();
      expect(result!.category).toBe('known_limitation');
      expect(result!.source_agent).toBe('system');
      expect(result!.content).toContain('2 attempts');
      expect(result!.content).toContain('third-party API limitation');
    });

    it('returns null when no failure history', () => {
      const finding = makeFinding({
        status: 'wont_fix',
        failure_history: null,
      });

      const result = extractor.extractFromWontFix(finding);
      expect(result).toBeNull();
    });

    it('returns null when failure history is empty array', () => {
      const finding = makeFinding({
        status: 'wont_fix',
        failure_history: '[]',
      });

      const result = extractor.extractFromWontFix(finding);
      expect(result).toBeNull();
    });

    it('includes attempt count in content', () => {
      const history = [
        { cycle_id: 'c1', approach: 'A', failure_reason: 'fail1', timestamp: '2026-03-01T00:00:00Z' },
        { cycle_id: 'c2', approach: 'B', failure_reason: 'fail2', timestamp: '2026-03-01T01:00:00Z' },
        { cycle_id: 'c3', approach: 'C', failure_reason: 'fail3', timestamp: '2026-03-01T02:00:00Z' },
      ];
      const finding = makeFinding({
        title: 'Persistent build failure',
        failure_history: JSON.stringify(history),
      });

      const result = extractor.extractFromWontFix(finding);

      expect(result).not.toBeNull();
      expect(result!.content).toContain('3 attempts');
      expect(result!.content).toContain('fail3');
    });
  });

  describe('extractFromResolvedCycle', () => {
    it('extracts resolved pattern from successful cycle', () => {
      const finding = makeFinding({
        category: 'bug',
        title: 'Fix null pointer in user service',
        description: 'User service throws NPE when user is not found',
      });

      const result = extractor.extractFromResolvedCycle(finding, 'Fixed by adding null check before accessing user properties');

      expect(result).not.toBeNull();
      expect(result!.category).toBe('resolved_pattern');
      expect(result!.source_agent).toBe('Developer');
      expect(result!.content).toContain('Resolved:');
      expect(result!.content).toContain('User service throws NPE');
    });

    it('returns null when devOutput is empty', () => {
      const finding = makeFinding({
        title: 'Some finding',
        description: 'Some description',
      });

      const result = extractor.extractFromResolvedCycle(finding, '');
      expect(result).toBeNull();
    });

    it('returns null when finding description is empty', () => {
      const finding = makeFinding({
        title: 'Some finding',
        description: '',
      });

      const result = extractor.extractFromResolvedCycle(finding, 'Some dev output');
      expect(result).toBeNull();
    });

    it('includes finding category in title', () => {
      const finding = makeFinding({
        category: 'performance',
        title: 'Slow database query on dashboard',
        description: 'The main dashboard query takes 5 seconds',
      });

      const result = extractor.extractFromResolvedCycle(finding, 'Added index on created_at column');

      expect(result).not.toBeNull();
      expect(result!.title).toContain('[performance]');
      expect(result!.title).toContain('Slow database query on dashboard');
    });
  });
});
