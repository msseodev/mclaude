import { ClaudeExecutor } from './claude-executor';
import {
  getPrompts,
  getPrompt,
  updatePrompt,
  getNextPendingPrompt,
  resetPromptStatuses,
  createSession,
  getSession,
  updateSession,
  createExecution,
  updateExecution,
  getSetting,
} from './db';
import type { SSEEvent, RateLimitInfo, RunStatus, SessionStatus } from './types';

const BACKOFF_BASE_MS = 5 * 60 * 1000; // 5 minutes
const BACKOFF_MAX_MS = 40 * 60 * 1000; // 40 minutes
const EVENT_BUFFER_SIZE = 500;

class RunManagerImpl {
  private executor: ClaudeExecutor | null = null;
  private currentSessionId: string | null = null;
  private currentExecutionId: string | null = null;
  private retryCount: number = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private waitingUntil: Date | null = null;
  private listeners: Set<(event: SSEEvent) => void> = new Set();
  private eventBuffer: SSEEvent[] = [];
  private currentOutput: string = '';

  // SSE listener management
  addListener(listener: (event: SSEEvent) => void): () => void {
    this.listeners.add(listener);
    // Send buffered events to new subscriber
    for (const event of this.eventBuffer) {
      listener(event);
    }
    return () => this.listeners.delete(listener);
  }

  private emit(event: SSEEvent): void {
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > EVENT_BUFFER_SIZE) {
      this.eventBuffer = this.eventBuffer.slice(-EVENT_BUFFER_SIZE);
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener may have been disconnected
      }
    }
  }

  async startQueue(startFromPromptId?: string): Promise<void> {
    // Guard against starting a queue while one is already running
    if (this.executor?.isRunning()) {
      throw new Error('Queue is already running');
    }
    if (this.currentSessionId) {
      await this.stopQueue();
    }

    // Reset prompt statuses, optionally starting from a specific prompt
    if (startFromPromptId) {
      const targetPrompt = getPrompt(startFromPromptId);
      if (!targetPrompt) {
        throw new Error('Prompt not found');
      }
      resetPromptStatuses(targetPrompt.queue_order);
    } else {
      resetPromptStatuses();
    }

    const prompts = getPrompts().filter(p => p.status === 'pending');
    if (prompts.length === 0) {
      throw new Error('No pending prompts in queue');
    }

    // Create a new run session
    const session = createSession();
    this.currentSessionId = session.id;
    updateSession(session.id, { status: 'running' });

    // Reset retry count and clear buffer for new run
    this.retryCount = 0;
    this.waitingUntil = null;
    this.eventBuffer = [];
    this.currentOutput = '';

    this.emit({
      type: 'session_status',
      data: { status: 'running', sessionId: session.id },
      timestamp: new Date().toISOString(),
    });

    this.processNextPrompt();
  }

  private processNextPrompt(): void {
    if (!this.currentSessionId) return;

    const session = getSession(this.currentSessionId);
    if (!session || session.status === 'stopped' || session.status === 'paused') return;

    const nextPrompt = getNextPendingPrompt();
    if (!nextPrompt) {
      // No more prompts, queue is complete
      updateSession(this.currentSessionId, { status: 'completed', current_prompt_id: null });
      this.emit({
        type: 'queue_complete',
        data: { sessionId: this.currentSessionId },
        timestamp: new Date().toISOString(),
      });
      this.currentSessionId = null;
      return;
    }

    // Update prompt status to running
    updatePrompt(nextPrompt.id, { status: 'running' });

    // Create execution record
    const execution = createExecution({
      prompt_id: nextPrompt.id,
      run_session_id: this.currentSessionId,
    });
    this.currentExecutionId = execution.id;
    this.currentOutput = '';

    // Update session's current prompt
    updateSession(this.currentSessionId, { current_prompt_id: nextPrompt.id });

    // Emit prompt_start event
    this.emit({
      type: 'prompt_start',
      data: {
        promptId: nextPrompt.id,
        promptTitle: nextPrompt.title,
        executionId: execution.id,
      },
      timestamp: new Date().toISOString(),
    });

    // Get working directory
    const workingDirectory = nextPrompt.working_directory || getSetting('working_directory') || process.cwd();
    const claudeBinary = getSetting('claude_binary') || 'claude';

    // Create executor and run
    this.executor = new ClaudeExecutor(
      claudeBinary,
      (event: SSEEvent) => {
        if (event.type === 'text_delta') {
          this.currentOutput += (event.data.text as string) || '';
        }
        this.emit(event);
      },
      (info: RateLimitInfo) => {
        this.handleRateLimit(info);
      },
      (result) => {
        this.handlePromptComplete(result);
      },
    );

    this.executor.execute(nextPrompt.content, workingDirectory);
  }

  private handlePromptComplete(result: { cost_usd: number | null; duration_ms: number | null; output: string; isError: boolean }): void {
    if (!this.currentSessionId) return;

    const session = getSession(this.currentSessionId);
    if (!session) return;

    const promptId = session.current_prompt_id;
    if (!promptId) return;

    const now = new Date().toISOString();

    // Update execution record
    if (this.currentExecutionId) {
      updateExecution(this.currentExecutionId, {
        status: result.isError ? 'failed' : 'completed',
        output: result.output,
        cost_usd: result.cost_usd,
        duration_ms: result.duration_ms,
        completed_at: now,
      });
    }

    // Update prompt status
    const newStatus = result.isError ? 'failed' : 'completed';
    updatePrompt(promptId, { status: newStatus });

    // Reset retry count on success
    if (!result.isError) {
      this.retryCount = 0;
    }

    const prompt = getPrompt(promptId);

    // Emit completion event
    this.emit({
      type: result.isError ? 'prompt_failed' : 'prompt_complete',
      data: {
        promptId,
        promptTitle: prompt?.title ?? '',
        executionId: this.currentExecutionId,
        cost_usd: result.cost_usd,
        duration_ms: result.duration_ms,
        isError: result.isError,
      },
      timestamp: new Date().toISOString(),
    });

    this.executor = null;
    this.currentExecutionId = null;

    // Process next prompt in queue
    this.processNextPrompt();
  }

  private handleRateLimit(info: RateLimitInfo): void {
    if (!this.currentSessionId) return;

    const session = getSession(this.currentSessionId);
    if (!session) return;

    // Update session status
    updateSession(this.currentSessionId, { status: 'waiting_for_limit' });

    // Reset current prompt back to pending so it can be retried
    if (session.current_prompt_id) {
      updatePrompt(session.current_prompt_id, { status: 'pending' });
    }

    // Update execution as rate limited
    if (this.currentExecutionId) {
      updateExecution(this.currentExecutionId, {
        status: 'rate_limited',
        output: this.currentOutput,
        completed_at: new Date().toISOString(),
      });
    }

    // Use parsed reset time if available, otherwise fall back to exponential backoff
    const backoffMs = info.retryAfterMs
      ? info.retryAfterMs
      : Math.min(BACKOFF_BASE_MS * Math.pow(2, this.retryCount), BACKOFF_MAX_MS);
    this.waitingUntil = new Date(Date.now() + backoffMs);

    // Emit rate limit event
    this.emit({
      type: 'rate_limit',
      data: {
        message: info.message,
        source: info.source,
        retryAfterMs: backoffMs,
        waitingUntil: this.waitingUntil.toISOString(),
        retryCount: this.retryCount + 1,
      },
      timestamp: new Date().toISOString(),
    });

    // Schedule retry
    this.retryTimer = setTimeout(() => {
      this.retryAfterLimit();
    }, backoffMs);

    this.retryCount++;
    this.executor = null;
    this.currentExecutionId = null;
  }

  private retryAfterLimit(): void {
    if (!this.currentSessionId) return;

    this.waitingUntil = null;
    this.retryTimer = null;

    const session = getSession(this.currentSessionId);
    if (!session || session.status === 'stopped' || session.status === 'paused') return;

    updateSession(this.currentSessionId, { status: 'running' });

    this.emit({
      type: 'session_status',
      data: { status: 'running', sessionId: this.currentSessionId },
      timestamp: new Date().toISOString(),
    });

    this.processNextPrompt();
  }

  async stopQueue(): Promise<void> {
    // Kill executor if running
    if (this.executor) {
      this.executor.kill();
      this.executor = null;
    }

    // Clear retry timer
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.waitingUntil = null;

    // Update current prompt back to pending
    if (this.currentSessionId) {
      const session = getSession(this.currentSessionId);
      if (session?.current_prompt_id) {
        updatePrompt(session.current_prompt_id, { status: 'pending' });
      }

      // Update execution if any
      if (this.currentExecutionId) {
        updateExecution(this.currentExecutionId, {
          status: 'failed',
          output: this.currentOutput,
          completed_at: new Date().toISOString(),
        });
      }

      updateSession(this.currentSessionId, { status: 'stopped', current_prompt_id: null });

      this.emit({
        type: 'queue_stopped',
        data: { sessionId: this.currentSessionId },
        timestamp: new Date().toISOString(),
      });
    }

    this.currentSessionId = null;
    this.currentExecutionId = null;
  }

  async pauseQueue(): Promise<void> {
    // Kill executor if running
    if (this.executor) {
      this.executor.kill();
      this.executor = null;
    }

    // Clear retry timer
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.waitingUntil = null;

    if (this.currentSessionId) {
      const session = getSession(this.currentSessionId);

      // Update current prompt back to pending
      if (session?.current_prompt_id) {
        updatePrompt(session.current_prompt_id, { status: 'pending' });
      }

      // Update execution if any
      if (this.currentExecutionId) {
        updateExecution(this.currentExecutionId, {
          status: 'failed',
          output: this.currentOutput,
          completed_at: new Date().toISOString(),
        });
        this.currentExecutionId = null;
      }

      updateSession(this.currentSessionId, { status: 'paused' });

      this.emit({
        type: 'session_status',
        data: { status: 'paused', sessionId: this.currentSessionId },
        timestamp: new Date().toISOString(),
      });
    }
  }

  async resumeQueue(): Promise<void> {
    if (!this.currentSessionId) {
      throw new Error('No active session to resume');
    }

    const session = getSession(this.currentSessionId);
    if (!session || session.status !== 'paused') {
      throw new Error('Session is not paused');
    }

    updateSession(this.currentSessionId, { status: 'running' });

    this.emit({
      type: 'session_status',
      data: { status: 'running', sessionId: this.currentSessionId },
      timestamp: new Date().toISOString(),
    });

    this.processNextPrompt();
  }

  getStatus(): RunStatus {
    const allPrompts = getPrompts();
    const completedCount = allPrompts.filter(p => p.status === 'completed').length;
    const totalCount = allPrompts.length;

    let status: SessionStatus = 'idle';
    let currentPromptId: string | null = null;
    let currentPromptTitle: string | null = null;

    if (this.currentSessionId) {
      const session = getSession(this.currentSessionId);
      if (session) {
        status = session.status as SessionStatus;
        currentPromptId = session.current_prompt_id;
        if (currentPromptId) {
          const prompt = getPrompt(currentPromptId);
          currentPromptTitle = prompt?.title ?? null;
        }
      }
    }

    return {
      sessionId: this.currentSessionId,
      status,
      currentPromptId,
      currentPromptTitle,
      completedCount,
      totalCount,
      waitingUntil: this.waitingUntil?.toISOString() ?? null,
      retryCount: this.retryCount,
    };
  }

  clearBuffer(): void {
    this.eventBuffer = [];
  }
}

// globalThis singleton for HMR safety
const globalForRunManager = globalThis as unknown as { runManager: RunManagerImpl };
export const runManager = globalForRunManager.runManager || new RunManagerImpl();
globalForRunManager.runManager = runManager;
