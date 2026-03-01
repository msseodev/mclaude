import { describe, it, expect } from 'vitest';
import { parseAgentOutput } from '../../src/lib/autonomous/output-parser';

describe('parseAgentOutput', () => {
  describe('Product Designer output', () => {
    it('extracts features from JSON code block and generates summary', () => {
      const rawOutput = `Here is my analysis:

\`\`\`json
{
  "features": [
    { "title": "Dark Mode", "priority": "P0", "description": "Add dark mode toggle" },
    { "title": "Search", "priority": "P1", "description": "Full-text search" },
    { "title": "Tags", "priority": "P2", "description": "Tag management" }
  ],
  "analysis_summary": "Focus on UX improvements"
}
\`\`\`

Please review the above features.`;

      const result = parseAgentOutput('product_designer', rawOutput);
      expect(result.structuredData).not.toBeNull();
      expect(result.structuredData!.features).toHaveLength(3);
      expect(result.summary).toContain('Proposed 3 features');
      expect(result.summary).toContain('[P0] Dark Mode');
      expect(result.summary).toContain('[P1] Search');
      expect(result.summary).toContain('[P2] Tags');
      expect(result.summary).toContain('Focus on UX improvements');
    });

    it('handles Product Designer with space in name', () => {
      const rawOutput = '```json\n{"features": [{"title": "Login", "priority": "P0"}]}\n```';
      const result = parseAgentOutput('Product Designer', rawOutput);
      expect(result.summary).toContain('Proposed 1 features');
      expect(result.summary).toContain('[P0] Login');
    });

    it('uses default priority when priority is missing', () => {
      const rawOutput = '```json\n{"features": [{"title": "Feature A"}]}\n```';
      const result = parseAgentOutput('product_designer', rawOutput);
      expect(result.summary).toContain('[P2] Feature A');
    });

    it('falls back to truncated raw output when no structured features', () => {
      const rawOutput = 'Some plain text designer output without JSON';
      const result = parseAgentOutput('product_designer', rawOutput);
      expect(result.structuredData).toBeNull();
      expect(result.summary).toBe(rawOutput);
    });
  });

  describe('Reviewer output', () => {
    it('parses approved review with zero issues', () => {
      const rawOutput = '```json\n{"approved": true, "issues": [], "summary": "LGTM"}\n```';
      const result = parseAgentOutput('reviewer', rawOutput);
      expect(result.structuredData).not.toBeNull();
      expect(result.structuredData!.approved).toBe(true);
      expect(result.summary).toBe('Review: APPROVED (0 issues). LGTM');
    });

    it('parses rejected review with issues', () => {
      const rawOutput = JSON.stringify({
        approved: false,
        issues: [
          { severity: 'critical', description: 'Missing validation' },
          { severity: 'major', description: 'No error handling' },
        ],
        summary: 'Needs work',
      });
      const result = parseAgentOutput('reviewer', rawOutput);
      expect(result.structuredData).not.toBeNull();
      expect(result.summary).toBe('Review: REJECTED (2 issues). Needs work');
    });

    it('parses approved review without summary field', () => {
      const rawOutput = '{"approved": true, "issues": []}';
      const result = parseAgentOutput('reviewer', rawOutput);
      expect(result.summary).toBe('Review: APPROVED (0 issues)');
    });
  });

  describe('QA Engineer output', () => {
    it('parses test summary stats', () => {
      const rawOutput = JSON.stringify({
        summary: { passed: 8, failed: 2, total: 10 },
        failures: [{ test: 'login', error: 'timeout' }],
      });
      const result = parseAgentOutput('qa_engineer', rawOutput);
      expect(result.structuredData).not.toBeNull();
      expect(result.summary).toBe('Tests: 8 passed, 2 failed, 10 total');
    });

    it('handles QA Engineer with space in name', () => {
      const rawOutput = '```json\n{"summary": {"passed": 5, "failed": 0, "total": 5}}\n```';
      const result = parseAgentOutput('QA Engineer', rawOutput);
      expect(result.summary).toBe('Tests: 5 passed, 0 failed, 5 total');
    });

    it('uses 0 for missing summary fields', () => {
      const rawOutput = '{"summary": {}}';
      const result = parseAgentOutput('qa_engineer', rawOutput);
      expect(result.summary).toBe('Tests: 0 passed, 0 failed, 0 total');
    });
  });

  describe('Developer output (plain text, no structured JSON)', () => {
    it('returns raw output when under 1000 chars', () => {
      const rawOutput = 'I implemented the feature successfully. All tests pass.';
      const result = parseAgentOutput('developer', rawOutput);
      expect(result.structuredData).toBeNull();
      expect(result.summary).toBe(rawOutput);
    });

    it('truncates output to 1000 chars when over limit', () => {
      const rawOutput = 'A'.repeat(1500);
      const result = parseAgentOutput('developer', rawOutput);
      expect(result.structuredData).toBeNull();
      expect(result.summary).toHaveLength(1003); // 1000 + '...'
      expect(result.summary).toBe('A'.repeat(1000) + '...');
    });
  });

  describe('Malformed JSON', () => {
    it('returns null structuredData and truncated summary for malformed JSON', () => {
      const rawOutput = '```json\n{invalid json content here\n```';
      const result = parseAgentOutput('product_designer', rawOutput);
      expect(result.structuredData).toBeNull();
      expect(result.summary).toBe(rawOutput);
    });
  });

  describe('Empty output', () => {
    it('returns empty summary and null structuredData', () => {
      const result = parseAgentOutput('developer', '');
      expect(result.structuredData).toBeNull();
      expect(result.summary).toBe('');
    });

    it('returns empty summary for empty reviewer output', () => {
      const result = parseAgentOutput('reviewer', '');
      expect(result.structuredData).toBeNull();
      expect(result.summary).toBe('');
    });
  });
});
