import type { ExtractedFinding, FindingCategory, FindingPriority, AutoFinding } from './types';

const VALID_CATEGORIES: FindingCategory[] = ['bug', 'improvement', 'idea', 'test_failure', 'performance', 'accessibility', 'security'];
const VALID_PRIORITIES: FindingPriority[] = ['P0', 'P1', 'P2', 'P3'];

export class FindingExtractor {
  /**
   * Extract findings from Claude's output.
   * Looks for a JSON block containing { "findings": [...] }
   */
  extract(claudeOutput: string, existingFindings?: AutoFinding[]): ExtractedFinding[] {
    const jsonBlock = this.extractJsonBlock(claudeOutput);
    if (!jsonBlock) return [];

    try {
      const parsed = JSON.parse(jsonBlock);
      const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];

      return rawFindings
        .map((f: Record<string, unknown>) => this.validateFinding(f))
        .filter((f: ExtractedFinding | null): f is ExtractedFinding => f !== null)
        .filter((f: ExtractedFinding) => !this.isDuplicate(f, existingFindings ?? []));
    } catch {
      return [];
    }
  }

  /**
   * Extract JSON block from Claude output.
   * Looks for:
   * 1. ```json ... ``` code block
   * 2. { "findings": ... } raw JSON
   */
  private extractJsonBlock(text: string): string | null {
    // Try code block first
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      const content = codeBlockMatch[1].trim();
      if (content.includes('"findings"')) return content;
    }

    // Try raw JSON
    const jsonMatch = text.match(/\{[\s\S]*"findings"[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0];

    return null;
  }

  /**
   * Validate a raw finding object and return a typed ExtractedFinding or null.
   */
  private validateFinding(raw: Record<string, unknown>): ExtractedFinding | null {
    const category = String(raw.category || '');
    const priority = String(raw.priority || 'P2');
    const title = String(raw.title || '');
    const description = String(raw.description || '');

    if (!title) return null;
    if (!VALID_CATEGORIES.includes(category as FindingCategory)) return null;

    return {
      category: category as FindingCategory,
      priority: VALID_PRIORITIES.includes(priority as FindingPriority) ? priority as FindingPriority : 'P2',
      title,
      description,
      file_path: raw.file_path ? String(raw.file_path) : null,
    };
  }

  /**
   * Check if a finding is a duplicate of an existing one.
   * Simple title similarity check.
   */
  private isDuplicate(finding: ExtractedFinding, existing: AutoFinding[]): boolean {
    const normalizedTitle = finding.title.toLowerCase().trim();
    return existing.some(e => {
      const existingTitle = e.title.toLowerCase().trim();
      return existingTitle === normalizedTitle ||
             this.similarity(existingTitle, normalizedTitle) > 0.8;
    });
  }

  /**
   * Simple string similarity (Dice coefficient).
   */
  private similarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

    const bigrams = new Map<string, number>();
    for (let i = 0; i < a.length - 1; i++) {
      const bigram = a.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }

    let intersections = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const bigram = b.substring(i, i + 2);
      const count = bigrams.get(bigram) || 0;
      if (count > 0) {
        bigrams.set(bigram, count - 1);
        intersections++;
      }
    }

    return (2 * intersections) / (a.length + b.length - 2);
  }
}
