import type { AutoSession, AutoUserPrompt } from './types';

export function buildUserPrompt(session: AutoSession, prompts: AutoUserPrompt[], currentCycle?: number): string {
  const parts: string[] = [];

  // 1. Initial Prompt (always first)
  if (session.initial_prompt) {
    parts.push(`## Project Goal\n${session.initial_prompt}`);
  }

  // 2. Mid-Session Prompts (filter expired, chronological)
  const activePrompts = prompts.filter(p => {
    if (p.active_for_cycles == null) return true; // permanent
    if (currentCycle == null) return true; // no cycle info, include all
    return currentCycle < p.added_at_cycle + p.active_for_cycles;
  });

  if (activePrompts.length > 0) {
    parts.push(`## Additional Instructions`);
    for (const p of activePrompts) {
      const scope = p.active_for_cycles != null
        ? ` (active for ${p.active_for_cycles} cycles, expires after cycle ${p.added_at_cycle + p.active_for_cycles - 1})`
        : '';
      parts.push(`- [Cycle ${p.added_at_cycle}${scope}] ${p.content}`);
    }
  }

  return parts.join('\n\n');
}
