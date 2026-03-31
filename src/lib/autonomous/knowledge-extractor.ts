import type { AutoFinding, KnowledgeCategory } from './types';

export interface ExtractedKnowledge {
  category: KnowledgeCategory;
  title: string;
  content: string;
  source_agent: string;
}

const CONVENTION_KEYWORDS = [
  'always', 'never', 'should', 'must', 'convention',
  'pattern', 'consistent', 'standard',
];

const MAX_CONVENTIONS_PER_CALL = 3;

function containsConventionKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return CONVENTION_KEYWORDS.some(kw => lower.includes(kw));
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

export class KnowledgeExtractor {
  /**
   * Extract coding conventions from Reviewer output.
   * Looks at structuredData.issues array for patterns.
   * If reviewer mentions specific patterns or rules, extract them.
   */
  extractFromReviewerOutput(
    _output: string,
    structuredData: Record<string, unknown> | null,
  ): ExtractedKnowledge[] {
    if (!structuredData) return [];

    const issues = structuredData.issues;
    if (!Array.isArray(issues)) return [];

    const results: ExtractedKnowledge[] = [];

    for (const issue of issues) {
      if (results.length >= MAX_CONVENTIONS_PER_CALL) break;
      if (!issue || typeof issue !== 'object') continue;

      const severity = (issue as Record<string, unknown>).severity;
      if (severity !== 'warning' && severity !== 'error') continue;

      const description = typeof (issue as Record<string, unknown>).description === 'string'
        ? (issue as Record<string, unknown>).description as string
        : '';
      const suggestion = typeof (issue as Record<string, unknown>).suggestion === 'string'
        ? (issue as Record<string, unknown>).suggestion as string
        : '';

      const combinedText = `${description} ${suggestion}`;
      if (!containsConventionKeyword(combinedText)) continue;

      const contentParts = [description];
      if (suggestion) {
        contentParts.push(suggestion);
      }

      results.push({
        category: 'coding_convention',
        title: truncate(description, 80),
        content: contentParts.join('. '),
        source_agent: 'Reviewer',
      });
    }

    return results;
  }

  /**
   * Extract known limitation from a wont_fix finding.
   * Called when a finding reaches max retries and becomes wont_fix.
   */
  extractFromWontFix(finding: AutoFinding): ExtractedKnowledge | null {
    if (!finding.failure_history) return null;

    let history: Array<{ failure_reason?: string }>;
    try {
      history = JSON.parse(finding.failure_history);
    } catch {
      return null;
    }

    if (!Array.isArray(history) || history.length === 0) return null;

    const lastEntry = history[history.length - 1];
    const lastReason = typeof lastEntry.failure_reason === 'string'
      ? lastEntry.failure_reason
      : 'Unknown failure';

    return {
      category: 'known_limitation',
      title: truncate(finding.title, 100),
      content: `Failed after ${history.length} attempts. Last failure: ${lastReason}`,
      source_agent: 'system',
    };
  }

  /**
   * Extract resolved pattern from a successfully fixed finding.
   * Called when a finding is successfully resolved.
   */
  extractFromResolvedCycle(
    finding: AutoFinding,
    devOutput: string,
  ): ExtractedKnowledge | null {
    if (!devOutput || !finding.description) return null;

    return {
      category: 'resolved_pattern',
      title: truncate(`[${finding.category}] ${finding.title}`, 100),
      content: `Resolved: ${finding.description.slice(0, 200)}`,
      source_agent: 'Developer',
    };
  }
}
