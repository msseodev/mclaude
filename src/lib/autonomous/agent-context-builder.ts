import type { AutoAgent, AutoFinding } from './types';

export interface AgentContext {
  userPrompt: string;
  sessionState: string;
  previousOutputs: Map<string, string>;
  finding?: AutoFinding | null;
  reviewFeedback?: string;
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
    parts.push(`\n[Issue to Fix]\n- Title: ${ctx.finding.title}\n- Description: ${ctx.finding.description}\n- File: ${ctx.finding.file_path ?? 'N/A'}`);
  }

  // 5. Previous agent outputs
  for (const [agentName, output] of ctx.previousOutputs) {
    parts.push(`\n[${agentName} Output]\n${output}`);
  }

  // 6. Reviewer feedback (for Developer re-run)
  if (ctx.reviewFeedback) {
    parts.push(`\n[Reviewer Feedback]\nPlease address the following issues:\n${ctx.reviewFeedback}`);
  }

  // 7. Git diff (for Reviewer)
  if (ctx.gitDiff) {
    parts.push(`\n[Code Changes (git diff)]\n${ctx.gitDiff}`);
  }

  return parts.join('\n\n');
}
