import type { AutoSession, AutoUserPrompt } from './types';

export function buildUserPrompt(session: AutoSession, prompts: AutoUserPrompt[]): string {
  const parts: string[] = [];

  // 1. Initial Prompt (always first)
  if (session.initial_prompt) {
    parts.push(`## Project Goal\n${session.initial_prompt}`);
  }

  // 2. Mid-Session Prompts (chronological)
  if (prompts.length > 0) {
    parts.push(`## Additional Instructions`);
    for (const p of prompts) {
      parts.push(`- [Cycle ${p.added_at_cycle}] ${p.content}`);
    }
  }

  return parts.join('\n\n');
}
