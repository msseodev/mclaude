export interface ParsedAgentOutput {
  structuredData: Record<string, unknown> | null;
  summary: string;
}

export function parseAgentOutput(agentName: string, rawOutput: string): ParsedAgentOutput {
  const structuredData = extractJson(rawOutput);
  const summary = generateSummary(agentName, rawOutput, structuredData);
  return { structuredData, summary };
}

function extractJson(output: string): Record<string, unknown> | null {
  // Try code block first: ```json ... ```
  const codeBlockMatch = output.match(/```json\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* fall through */ }
  }

  // Try raw JSON patterns with known keys
  const jsonPatterns = [
    /\{[\s\S]*"features"[\s\S]*\}/,
    /\{[\s\S]*"approved"[\s\S]*\}/,
    /\{[\s\S]*"summary"[\s\S]*\}/,
  ];

  for (const pattern of jsonPatterns) {
    const match = output.match(pattern);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch { /* try next */ }
    }
  }

  return null;
}

function generateSummary(
  agentName: string,
  rawOutput: string,
  structuredData: Record<string, unknown> | null,
): string {
  const nameLower = agentName.toLowerCase();

  // Product Designer
  if (nameLower === 'product_designer' || nameLower === 'product designer') {
    return summarizeDesigner(structuredData, rawOutput);
  }

  // Reviewer
  if (nameLower === 'reviewer') {
    return summarizeReviewer(structuredData, rawOutput);
  }

  // QA Engineer
  if (nameLower === 'qa_engineer' || nameLower === 'qa engineer') {
    return summarizeQA(structuredData, rawOutput);
  }

  // Default (Developer, etc.)
  if (rawOutput.length <= 1000) {
    return rawOutput;
  }
  return rawOutput.slice(0, 1000) + '...';
}

function summarizeDesigner(
  data: Record<string, unknown> | null,
  rawOutput: string,
): string {
  if (data && Array.isArray(data.features)) {
    const features = data.features as Array<Record<string, unknown>>;
    const featureList = features
      .map(f => `[${f.priority ?? 'P2'}] ${f.title ?? 'untitled'}`)
      .join('; ');
    const analysisSummary = typeof data.analysis_summary === 'string' ? data.analysis_summary : '';
    const parts = [`Proposed ${features.length} features: ${featureList}`];
    if (analysisSummary) {
      parts.push(analysisSummary);
    }
    return parts.join('. ');
  }
  if (rawOutput.length <= 1000) {
    return rawOutput;
  }
  return rawOutput.slice(0, 1000) + '...';
}

function summarizeReviewer(
  data: Record<string, unknown> | null,
  rawOutput: string,
): string {
  if (data && typeof data.approved === 'boolean') {
    const status = data.approved ? 'APPROVED' : 'REJECTED';
    const issues = Array.isArray(data.issues) ? data.issues.length : 0;
    const summary = typeof data.summary === 'string' ? data.summary : '';
    const parts = [`Review: ${status} (${issues} issues)`];
    if (summary) {
      parts.push(summary);
    }
    return parts.join('. ');
  }
  if (rawOutput.length <= 1000) {
    return rawOutput;
  }
  return rawOutput.slice(0, 1000) + '...';
}

function summarizeQA(
  data: Record<string, unknown> | null,
  rawOutput: string,
): string {
  if (data && data.summary && typeof data.summary === 'object') {
    const s = data.summary as Record<string, unknown>;
    const passed = s.passed ?? 0;
    const failed = s.failed ?? 0;
    const total = s.total ?? 0;
    return `Tests: ${passed} passed, ${failed} failed, ${total} total`;
  }
  if (rawOutput.length <= 1000) {
    return rawOutput;
  }
  return rawOutput.slice(0, 1000) + '...';
}
