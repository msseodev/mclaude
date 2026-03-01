import { spawn, execFileSync } from 'child_process';
import path from 'path';
import type { AutoAgentRun } from './types';

const MAX_INPUT_LENGTH = 20000;
const SUMMARIZE_TIMEOUT_MS = 120000; // 2 minutes per agent

export async function summarizeAgentOutputs(
  claudeBinary: string,
  agentRuns: AutoAgentRun[],
): Promise<Map<string, string>> {
  const summaries = new Map<string, string>();

  for (const run of agentRuns) {
    if (!run.output || run.status === 'skipped') continue;

    try {
      const summary = await summarizeSingleAgent(claudeBinary, run.agent_name, run.output);
      if (summary) {
        summaries.set(run.agent_name, summary);
      }
    } catch {
      // Skip this agent's summary on failure, buildCycleDoc will fall back to truncation
    }
  }

  return summaries;
}

async function summarizeSingleAgent(
  claudeBinary: string,
  agentName: string,
  output: string,
): Promise<string> {
  const truncated = output.length > MAX_INPUT_LENGTH
    ? output.slice(0, MAX_INPUT_LENGTH) + '\n...(truncated)'
    : output;

  const prompt = `You are summarizing a ${agentName} agent's output from an autonomous development cycle.

Summarize the key points concisely:
- What was analyzed or decided
- What changes were made (if any)
- Key outcomes or findings
- Any issues found

Use bullet points. Keep it under 300 words. Output ONLY the summary, no preamble.

---
${truncated}
---`;

  return runClaudeOneShot(claudeBinary, prompt);
}

export async function generateCommitMessage(
  claudeBinary: string,
  gitDiff: string,
  cycleNumber: number,
): Promise<string> {
  const truncatedDiff = gitDiff.length > MAX_INPUT_LENGTH
    ? gitDiff.slice(0, MAX_INPUT_LENGTH) + '\n...(truncated)'
    : gitDiff;

  const prompt = `Generate a git commit message for the following changes. Follow conventional commit format:
- Type: feat, bugfix, refactor, docs, config, test
- Subject line: imperative mood, under 70 chars, no period
- Body: 1-3 sentences explaining what and why (not how)

Prefix the subject with [mclaude-auto] cycle ${cycleNumber}.

Output ONLY the commit message, nothing else.

---
${truncatedDiff}
---`;

  const result = await runClaudeOneShot(claudeBinary, prompt);
  if (!result) {
    return `[mclaude-auto] cycle ${cycleNumber}: Pipeline cycle completed`;
  }
  return result;
}

export function runClaudeOneShot(binary: string, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    let resolvedBinary: string;
    try {
      resolvedBinary = path.isAbsolute(binary)
        ? binary
        : execFileSync('which', [binary], { encoding: 'utf-8' }).trim();
    } catch {
      resolve('');
      return;
    }

    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    const proc = spawn(resolvedBinary, [
      '-p', prompt,
      '--output-format', 'text',
      '--max-turns', '1',
      '--dangerously-skip-permissions',
    ], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, SUMMARIZE_TIMEOUT_MS);

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (timedOut || (code !== null && code !== 0)) {
        resolve('');
        return;
      }
      resolve(stdout.trim());
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve('');
    });
  });
}
