import { spawn, ChildProcess } from 'child_process';
import { StreamParser } from './stream-parser';
import { RateLimitDetector } from './rate-limit-detector';
import type { ClaudeEvent, SSEEvent, RateLimitInfo } from './types';

export class ClaudeExecutor {
  private process: ChildProcess | null = null;
  private streamParser: StreamParser;
  private rateLimitDetector: RateLimitDetector;
  private killed: boolean = false;
  private accumulatedOutput: string = '';
  private lastCostUsd: number | null = null;
  private lastDurationMs: number | null = null;
  private inToolUse: boolean = false;
  private currentToolName: string = 'unknown';
  private hasReceivedStreamingDeltas: boolean = false;

  constructor(
    private claudeBinary: string,
    private onEvent: (event: SSEEvent) => void,
    private onRateLimit: (info: RateLimitInfo) => void,
    private onComplete: (result: { cost_usd: number | null; duration_ms: number | null; output: string; isError: boolean }) => void,
  ) {
    this.streamParser = new StreamParser();
    this.rateLimitDetector = new RateLimitDetector();
  }

  execute(promptContent: string, workingDirectory: string): void {
    this.killed = false;
    this.accumulatedOutput = '';
    this.lastCostUsd = null;
    this.lastDurationMs = null;
    this.inToolUse = false;
    this.hasReceivedStreamingDeltas = false;

    const args = [
      '-p', promptContent,
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--max-turns', '50',
      '--dangerously-skip-permissions',
    ];

    // Build env without CLAUDECODE to prevent nesting
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    this.process = spawn(this.claudeBinary, args, {
      cwd: workingDirectory,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      const events = this.streamParser.parse(chunk);
      for (const event of events) {
        this.processEvent(event);
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      // Log stderr for debugging but don't treat as output
      console.error(`[claude-executor stderr] ${data.toString().trim()}`);
    });

    this.process.on('close', (code: number | null) => {
      // Flush remaining buffer
      const remaining = this.streamParser.flush();
      for (const event of remaining) {
        this.processEvent(event);
      }

      if (this.killed) return;

      // Check for rate limit via exit code
      const exitCodeCheck = this.rateLimitDetector.checkExitCode(code);
      if (exitCodeCheck.detected) {
        this.onRateLimit(exitCodeCheck);
        return;
      }

      // Check accumulated output text for rate limit patterns
      const textCheck = this.rateLimitDetector.checkText(this.accumulatedOutput);
      if (textCheck.detected) {
        this.onRateLimit(textCheck);
        return;
      }

      const isError = code !== null && code !== 0;
      this.onComplete({
        cost_usd: this.lastCostUsd,
        duration_ms: this.lastDurationMs,
        output: this.accumulatedOutput,
        isError,
      });
    });

    this.process.on('error', (err: Error) => {
      console.error(`[claude-executor] Process error: ${err.message}`);
      if (!this.killed) {
        this.onComplete({
          cost_usd: null,
          duration_ms: null,
          output: `Process error: ${err.message}`,
          isError: true,
        });
      }
    });
  }

  private processEvent(event: ClaudeEvent): void {
    // Check stream event for rate limits
    const rateLimitCheck = this.rateLimitDetector.checkStreamEvent(event);
    if (rateLimitCheck.detected) {
      this.kill();
      this.onRateLimit(rateLimitCheck);
      return;
    }

    switch (event.type) {
      case 'content_block_delta': {
        const delta = (event as { delta?: { type?: string; text?: string } }).delta;
        if (delta?.type === 'text_delta' && delta.text) {
          this.hasReceivedStreamingDeltas = true;
          this.accumulatedOutput += delta.text;
          this.emitSSE('text_delta', { text: delta.text });
        }
        break;
      }

      case 'content_block_start': {
        const block = (event as { content_block?: { type?: string; name?: string; id?: string } }).content_block;
        if (block?.type === 'tool_use') {
          this.inToolUse = true;
          this.currentToolName = block.name ?? 'unknown';
          this.emitSSE('tool_start', { tool: this.currentToolName, id: block.id ?? '' });
        }
        break;
      }

      case 'content_block_stop': {
        if (this.inToolUse) {
          this.inToolUse = false;
          this.emitSSE('tool_end', { tool: this.currentToolName });
          this.currentToolName = 'unknown';
        }
        break;
      }

      case 'assistant': {
        // Fallback: only use assistant message text if no streaming deltas were received
        // to avoid double-counting output
        if (!this.hasReceivedStreamingDeltas) {
          const msg = (event as { message?: { content?: Array<{ type: string; text?: string }> } }).message;
          if (msg?.content) {
            for (const block of msg.content) {
              if (block.type === 'text' && block.text) {
                this.accumulatedOutput += block.text;
                this.emitSSE('text_delta', { text: block.text });
              }
            }
          }
        }
        break;
      }

      case 'result': {
        const result = event as { cost_usd?: number; duration_ms?: number; total_cost_usd?: number };
        if (result.cost_usd !== undefined) this.lastCostUsd = result.cost_usd;
        if (result.total_cost_usd !== undefined) this.lastCostUsd = result.total_cost_usd;
        if (result.duration_ms !== undefined) this.lastDurationMs = result.duration_ms;
        break;
      }
    }
  }

  private emitSSE(type: SSEEvent['type'], data: Record<string, unknown>): void {
    this.onEvent({
      type,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  kill(): void {
    this.killed = true;
    const proc = this.process;
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
      // Force kill after 5 seconds if still alive
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 5000);
    }
    this.process = null;
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed && !this.killed;
  }
}
