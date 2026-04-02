import { describe, it, expect } from 'vitest';
import { FindingExtractor } from '@/lib/autonomous/finding-extractor';

describe('FindingExtractor JSON extraction (H-3)', () => {
  const extractor = new FindingExtractor();

  describe('greedy regex fix', () => {
    it('should not capture garbage between two separate JSON objects', () => {
      // Two separate JSON objects in output — greedy regex would match from first { to last }
      const output = [
        'Here is some analysis: {"irrelevant": true}',
        'Some text in between that is not JSON at all...',
        'And here are the findings:',
        '{"findings": [{"title": "Real bug", "category": "bug", "priority": "P1", "description": "A real issue"}]}',
      ].join('\n');

      const result = extractor.extract(output);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Real bug');
    });

    it('should correctly extract JSON when preceded by unrelated braces', () => {
      const output = [
        'The function signature is: function foo() { return bar; }',
        'And another block: if (x) { doStuff(); }',
        '{"findings": [{"title": "Found issue", "category": "improvement", "priority": "P2", "description": "Desc"}]}',
      ].join('\n');

      const result = extractor.extract(output);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Found issue');
    });
  });

  describe('large input handling', () => {
    it('should handle input larger than 100KB without hanging', () => {
      // Create a 150KB string with valid JSON at the start
      const validJson = '{"findings": [{"title": "Large input bug", "category": "bug", "priority": "P0", "description": "Found in large output"}]}';
      const padding = 'x'.repeat(150_000);
      const output = validJson + padding;

      const start = Date.now();
      const result = extractor.extract(output);
      const elapsed = Date.now() - start;

      // Should complete quickly (under 5 seconds even on slow machines)
      expect(elapsed).toBeLessThan(5000);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Large input bug');
    });

    it('should truncate input to 100KB and still find JSON within that range', () => {
      // Valid JSON within first 100KB
      const validJson = '{"findings": [{"title": "Within range", "category": "bug", "priority": "P2", "description": "Within 100KB"}]}';
      const padding = 'y'.repeat(120_000);
      const output = validJson + padding;

      const result = extractor.extract(output);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Within range');
    });
  });

  describe('balanced brace extraction', () => {
    it('should extract valid JSON using balanced brace matching when regex match is not valid JSON', () => {
      // The non-greedy regex might grab a partial match; balanced brace extraction should fix it
      const output = [
        'Analysis complete.',
        '{"findings": [{"title": "Balanced extraction", "category": "bug", "priority": "P1", "description": "Test balanced"}]}',
        'Some trailing text } with extra braces',
      ].join('\n');

      const result = extractor.extract(output);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Balanced extraction');
    });

    it('should handle nested JSON objects correctly', () => {
      const output = JSON.stringify({
        findings: [{
          title: 'Nested object test',
          category: 'bug',
          priority: 'P2',
          description: 'Has nested data',
          metadata: { nested: { deep: true } },
        }],
      });

      const result = extractor.extract(output);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Nested object test');
    });
  });

  describe('malformed JSON handling', () => {
    it('should return empty array for completely malformed JSON', () => {
      const output = 'This is not JSON at all { broken "findings" nope }';
      const result = extractor.extract(output);
      expect(result).toHaveLength(0);
    });

    it('should return empty array for JSON with unbalanced braces', () => {
      const output = '{"findings": [{"title": "Unbalanced", "category": "bug"';
      const result = extractor.extract(output);
      expect(result).toHaveLength(0);
    });

    it('should return empty array when no known keys are present', () => {
      const output = '{"unknown_key": [{"title": "Something"}]}';
      const result = extractor.extract(output);
      expect(result).toHaveLength(0);
    });
  });

  describe('code block extraction still works', () => {
    it('should prefer code block extraction over raw JSON', () => {
      const jsonContent = '{"findings": [{"title": "From code block", "category": "bug", "priority": "P1", "description": "In code block"}]}';
      const output = [
        'Here are the results:',
        '```json',
        jsonContent,
        '```',
        'And some raw JSON too: {"findings": [{"title": "Raw JSON", "category": "bug", "priority": "P1", "description": "Raw"}]}',
      ].join('\n');

      const result = extractor.extract(output);
      // Should get the code block version
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('From code block');
    });
  });
});
