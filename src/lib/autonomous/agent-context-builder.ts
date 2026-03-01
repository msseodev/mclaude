import type { AutoAgent, AutoFinding, FailureHistoryEntry } from './types';

export interface StructuredAgentOutput {
  agentName: string;
  summary: string;
  fullOutputId: string;
  structuredData: Record<string, unknown> | null;
}

export interface AgentContext {
  userPrompt: string;
  sessionState: string;
  previousOutputs: Map<string, string>;
  structuredOutputs?: StructuredAgentOutput[];
  finding?: AutoFinding | null;
  reviewFeedback?: string;
  designerFeedback?: string;
  gitDiff?: string;
}

export function buildAgentContext(agent: AutoAgent, ctx: AgentContext): string {
  const parts: string[] = [];

  // 1. Agent system prompt
  parts.push(agent.system_prompt);

  // 2. User Prompt
  if (ctx.userPrompt) {
    parts.push(`\n[User Prompt]\n${ctx.userPrompt}`);
  }

  // 3. Session State
  if (ctx.sessionState) {
    parts.push(`\n[Session State]\n${ctx.sessionState}`);
  }

  // 4. Finding info (for fix cycles)
  if (ctx.finding) {
    const findingParts = [
      `\n[Issue to Fix]`,
      `- Title: ${ctx.finding.title}`,
      `- Description: ${ctx.finding.description}`,
      `- File: ${ctx.finding.file_path ?? 'N/A'}`,
    ];

    if (ctx.finding.failure_history) {
      try {
        const history: FailureHistoryEntry[] = JSON.parse(ctx.finding.failure_history);
        if (history.length > 0) {
          findingParts.push('');
          findingParts.push('IMPORTANT: Previous approaches failed. Try a different strategy.');
          for (const entry of history) {
            findingParts.push(`- Attempt (${entry.timestamp}): ${entry.approach} -> Failed: ${entry.failure_reason}`);
          }
        }
      } catch { /* ignore malformed history */ }
    }

    parts.push(findingParts.join('\n'));
  }

  // 5. Previous agent outputs
  if (ctx.structuredOutputs && ctx.structuredOutputs.length > 0) {
    for (const so of ctx.structuredOutputs) {
      const soParts = [`\n[${so.agentName} Output Summary]`, so.summary];
      if (so.structuredData) {
        soParts.push(JSON.stringify(so.structuredData, null, 2));
      }
      parts.push(soParts.join('\n'));
    }
  } else {
    for (const [agentName, output] of ctx.previousOutputs) {
      parts.push(`\n[${agentName} Output]\n${output}`);
    }
  }

  // 6. Reviewer feedback (for Developer re-run)
  if (ctx.reviewFeedback) {
    parts.push(`\n[Reviewer Feedback]\nPlease address the following issues:\n${ctx.reviewFeedback}`);
  }

  // 6.5. Designer feedback (for Designer re-run)
  if (ctx.designerFeedback) {
    parts.push(`\n[Developer Feedback]\nThe developer encountered issues implementing the spec. Please revise:\n${ctx.designerFeedback}`);
  }

  // 7. Git diff (for Reviewer)
  if (ctx.gitDiff) {
    parts.push(`\n[Code Changes (git diff)]\n${ctx.gitDiff}`);
  }

  return parts.join('\n\n');
}
