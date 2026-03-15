import type { AutoAgent, AutoFinding, FailureHistoryEntry, CEORequest } from './types';

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
  screenFrames?: string[];  // Array of image file paths for visual analysis
  ceoRequests?: CEORequest[];
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

  // 8. Screen frames (for visual analysis agents: Product Designer, UX Planner)
  if (ctx.screenFrames && ctx.screenFrames.length > 0) {
    const frameList = ctx.screenFrames
      .map((f, i) => `${i + 1}. ${f}`)
      .join('\n');
    parts.push(
      `\n[앱 화면 캡처]\n다음 이미지 파일들은 앱의 현재 상태를 순서대로 캡처한 것입니다.\n각 이미지를 Read 도구로 확인하여 UI/UX를 분석하세요:\n${frameList}`,
    );
  }

  // 9. CEO requests/responses
  if (ctx.ceoRequests && ctx.ceoRequests.length > 0) {
    const pending = ctx.ceoRequests.filter(r => r.status === 'pending');
    const answered = ctx.ceoRequests.filter(r => r.status !== 'pending');

    const ceoParts: string[] = ['\n[CEO 요청/응답]'];

    if (answered.length > 0) {
      ceoParts.push('CEO가 응답한 항목:');
      for (const r of answered) {
        ceoParts.push(`- [${r.status}] ${r.title}: ${r.ceo_response}`);
      }
    }

    if (pending.length > 0) {
      ceoParts.push('대기 중인 요청 (이미 요청됨, 중복 요청하지 마세요):');
      for (const r of pending) {
        ceoParts.push(`- ${r.title} (${r.type})`);
      }
    }

    ceoParts.push('\nCEO에게 새 요청이 필요하면 출력에 포함하세요:');
    ceoParts.push('{ "ceo_requests": [{ "type": "permission|resource|decision|information", "title": "제목", "description": "상세 설명", "blocking": false }] }');

    parts.push(ceoParts.join('\n'));
  }

  return parts.join('\n\n');
}
