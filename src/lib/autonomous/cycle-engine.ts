import { ClaudeExecutor } from '../claude-executor';
import { getSetting } from '../db';
import {
  createAutoSession,
  getAutoSession,
  updateAutoSession,
  createAutoCycle,
  getAutoCycle,
  updateAutoCycle,
  getAutoCyclesBySession,
  createAutoFinding,
  getAutoFinding,
  updateAutoFinding,
  getAutoFindings,
  getOpenAutoFindings,
  getAllAutoSettings,
  initAutoTables,
} from './db';
import { PhaseSelector } from './phase-selector';
import { PromptBuilder } from './prompt-builder';
import { FindingExtractor } from './finding-extractor';
import { GitManager } from './git-manager';
import { StateManager } from './state-manager';
import type {
  AutoSSEEvent,
  AutoRunStatus,
  AutoSessionStatus,
  AutoPhase,
  AutoCycleStatus,
} from './types';
import type { SSEEvent, RateLimitInfo } from '../types';

const BACKOFF_BASE_MS = 5 * 60 * 1000; // 5 minutes
const BACKOFF_MAX_MS = 40 * 60 * 1000; // 40 minutes
const EVENT_BUFFER_SIZE = 500;
const MAX_CONSECUTIVE_FAILURES_DEFAULT = 5;

class CycleEngineImpl {
  private executor: ClaudeExecutor | null = null;
  private currentSessionId: string | null = null;
  private currentCycleId: string | null = null;
  private cycleNumber: number = 0;
  private currentPhase: AutoPhase | null = null;
  private currentFindingId: string | null = null;
  private lastPhase: AutoPhase | null = null;
  private lastCycleStatus: AutoCycleStatus | null = null;
  private lastFindingId: string | null = null;
  private retryCount: number = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private waitingUntil: Date | null = null;
  private listeners: Set<(event: AutoSSEEvent) => void> = new Set();
  private eventBuffer: AutoSSEEvent[] = [];
  private currentOutput: string = '';
  private consecutiveFailures: number = 0;
  private isPaused: boolean = false;
  private isStopping: boolean = false;

  // SSE listener management (identical pattern to RunManager)
  addListener(listener: (event: AutoSSEEvent) => void): () => void {
    this.listeners.add(listener);
    for (const event of this.eventBuffer) {
      listener(event);
    }
    return () => this.listeners.delete(listener);
  }

  private emit(event: AutoSSEEvent): void {
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > EVENT_BUFFER_SIZE) {
      this.eventBuffer = this.eventBuffer.slice(-EVENT_BUFFER_SIZE);
    }
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // Listener may have been disconnected
      }
    }
  }

  clearBuffer(): void {
    this.eventBuffer = [];
  }

  // --- Lifecycle ---

  async start(targetProject?: string): Promise<void> {
    // Guard: already running
    if (this.executor?.isRunning() || this.retryTimer || this.currentSessionId) {
      throw new Error('Autonomous mode is already running');
    }

    // Guard: manual mode active
    // Dynamic import to avoid circular dependency
    const { runManager } = await import('../run-manager');
    const manualStatus = runManager.getStatus();
    if (manualStatus.status !== 'idle') {
      throw new Error('Cannot start autonomous mode while manual queue is running');
    }

    // Init tables
    initAutoTables();

    // Get settings
    const settings = getAllAutoSettings();
    const project = targetProject || settings.target_project;
    if (!project) {
      throw new Error('Target project path is required');
    }

    // Create session
    const session = createAutoSession(project);
    this.currentSessionId = session.id;
    this.cycleNumber = 0;
    this.consecutiveFailures = 0;
    this.isPaused = false;
    this.isStopping = false;
    this.lastPhase = null;
    this.lastCycleStatus = null;
    this.lastFindingId = null;
    this.eventBuffer = [];
    this.currentOutput = '';

    this.emit({
      type: 'session_status',
      data: { status: 'running', sessionId: session.id },
      timestamp: new Date().toISOString(),
    });

    // Start the cycle loop
    this.processNextCycle();
  }

  async stop(): Promise<void> {
    this.isStopping = true;

    if (this.executor) {
      this.executor.kill();
      this.executor = null;
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.waitingUntil = null;

    // Update current cycle if any
    if (this.currentCycleId) {
      updateAutoCycle(this.currentCycleId, {
        status: 'failed',
        output: this.currentOutput,
        completed_at: new Date().toISOString(),
      });
    }

    if (this.currentSessionId) {
      updateAutoSession(this.currentSessionId, { status: 'stopped' });
      this.emit({
        type: 'session_status',
        data: { status: 'stopped', sessionId: this.currentSessionId },
        timestamp: new Date().toISOString(),
      });
    }

    this.resetState();
  }

  async pause(): Promise<void> {
    if (!this.currentSessionId) {
      throw new Error('No active autonomous session');
    }

    this.isPaused = true;

    if (this.executor) {
      this.executor.kill();
      this.executor = null;
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.waitingUntil = null;

    if (this.currentCycleId) {
      updateAutoCycle(this.currentCycleId, {
        status: 'failed',
        output: this.currentOutput,
        completed_at: new Date().toISOString(),
      });
      this.currentCycleId = null;
    }

    updateAutoSession(this.currentSessionId, { status: 'paused' });
    this.emit({
      type: 'session_status',
      data: { status: 'paused', sessionId: this.currentSessionId },
      timestamp: new Date().toISOString(),
    });
  }

  async resume(): Promise<void> {
    if (!this.currentSessionId) {
      throw new Error('No active autonomous session to resume');
    }

    const session = getAutoSession(this.currentSessionId);
    if (!session || session.status !== 'paused') {
      throw new Error('Session is not paused');
    }

    this.isPaused = false;
    updateAutoSession(this.currentSessionId, { status: 'running' });

    this.emit({
      type: 'session_status',
      data: { status: 'running', sessionId: this.currentSessionId },
      timestamp: new Date().toISOString(),
    });

    this.processNextCycle();
  }

  getStatus(): AutoRunStatus {
    if (!this.currentSessionId) {
      return {
        sessionId: null,
        status: 'idle',
        currentCycle: 0,
        currentPhase: null,
        currentFinding: null,
        stats: {
          totalCycles: 0,
          totalCostUsd: 0,
          findingsTotal: 0,
          findingsResolved: 0,
          findingsOpen: 0,
          testPassRate: null,
        },
        waitingUntil: null,
        retryCount: 0,
      };
    }

    const session = getAutoSession(this.currentSessionId);
    const allFindings = getAutoFindings({ session_id: this.currentSessionId });
    const openFindings = allFindings.filter(f => f.status === 'open' || f.status === 'in_progress');
    const resolvedFindings = allFindings.filter(f => f.status === 'resolved');

    let currentFinding: { id: string; title: string } | null = null;
    if (this.currentFindingId) {
      const f = getAutoFinding(this.currentFindingId);
      if (f) currentFinding = { id: f.id, title: f.title };
    }

    return {
      sessionId: this.currentSessionId,
      status: (session?.status as AutoSessionStatus) ?? 'running',
      currentCycle: this.cycleNumber,
      currentPhase: this.currentPhase,
      currentFinding,
      stats: {
        totalCycles: session?.total_cycles ?? 0,
        totalCostUsd: session?.total_cost_usd ?? 0,
        findingsTotal: allFindings.length,
        findingsResolved: resolvedFindings.length,
        findingsOpen: openFindings.length,
        testPassRate: null, // Could compute from recent test cycles
      },
      waitingUntil: this.waitingUntil?.toISOString() ?? null,
      retryCount: this.retryCount,
    };
  }

  // --- Internal cycle processing ---

  private processNextCycle(): void {
    if (this.isPaused || this.isStopping || !this.currentSessionId) return;

    // Use setTimeout to avoid deep call stacks
    setTimeout(async () => {
      try {
        await this._processNextCycleImpl();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.emit({
          type: 'error',
          data: { message },
          timestamp: new Date().toISOString(),
        });
        // Don't stop on error, try next cycle
        this.consecutiveFailures++;
        if (this.checkSafetyLimits()) {
          this.processNextCycle();
        }
      }
    }, 100); // Small delay between cycles
  }

  private async _processNextCycleImpl(): Promise<void> {
    if (!this.currentSessionId) return;

    const session = getAutoSession(this.currentSessionId);
    if (!session) return;

    // Safety check
    if (!this.checkSafetyLimits()) return;

    const settings = getAllAutoSettings();
    const openFindings = getOpenAutoFindings();

    // Select next phase
    const phaseSelector = new PhaseSelector(settings);
    const selection = phaseSelector.selectNextPhase({
      cycleNumber: this.cycleNumber,
      lastPhase: this.lastPhase,
      lastCycleStatus: this.lastCycleStatus,
      lastFindingId: this.lastFindingId,
      openFindings,
      totalCycles: session.total_cycles,
    });

    this.currentPhase = selection.phase;
    this.currentFindingId = selection.findingId;

    // Mark finding as in_progress
    if (selection.findingId) {
      updateAutoFinding(selection.findingId, { status: 'in_progress' });
    }

    // Git checkpoint
    let gitCheckpoint: string | null = null;
    if (settings.auto_commit) {
      const gitManager = new GitManager(session.target_project);
      gitCheckpoint = await gitManager.createCheckpoint(`before-cycle-${this.cycleNumber}`);
    }

    // Build prompt
    const promptBuilder = new PromptBuilder(settings);
    const stateManager = new StateManager(session.target_project);
    const stateContext = await stateManager.readState() || '';
    const allFindings = getAutoFindings({ session_id: this.currentSessionId });

    let prompt: string;
    switch (selection.phase) {
      case 'discovery':
        prompt = promptBuilder.buildDiscoveryPrompt(stateContext, allFindings);
        break;
      case 'fix': {
        const fixFinding = selection.findingId ? getAutoFinding(selection.findingId) : null;
        prompt = fixFinding
          ? promptBuilder.buildFixPrompt(stateContext, fixFinding)
          : promptBuilder.buildDiscoveryPrompt(stateContext, allFindings);
        break;
      }
      case 'test':
        prompt = promptBuilder.buildTestPrompt(stateContext);
        break;
      case 'improve': {
        const improveFinding = selection.findingId ? getAutoFinding(selection.findingId) : null;
        prompt = improveFinding
          ? promptBuilder.buildImprovePrompt(stateContext, improveFinding)
          : promptBuilder.buildDiscoveryPrompt(stateContext, allFindings);
        break;
      }
      case 'review': {
        const gitMgr = new GitManager(session.target_project);
        const diff = gitCheckpoint ? await gitMgr.getDiff(gitCheckpoint) : '';
        prompt = promptBuilder.buildReviewPrompt(stateContext, diff);
        break;
      }
    }

    // Create cycle record
    const cycle = createAutoCycle({
      session_id: this.currentSessionId,
      cycle_number: this.cycleNumber,
      phase: selection.phase,
      finding_id: selection.findingId,
      prompt_used: prompt,
      git_checkpoint: gitCheckpoint,
    });
    this.currentCycleId = cycle.id;
    this.currentOutput = '';

    // Emit cycle_start
    this.emit({
      type: 'cycle_start',
      data: {
        cycleId: cycle.id,
        cycleNumber: this.cycleNumber,
        phase: selection.phase,
        findingId: selection.findingId,
      },
      timestamp: new Date().toISOString(),
    });

    // Execute via ClaudeExecutor
    const claudeBinary = getSetting('claude_binary') || 'claude';
    this.executor = new ClaudeExecutor(
      claudeBinary,
      (event: SSEEvent) => {
        // Forward text_delta, tool_start, tool_end events
        if (event.type === 'text_delta') {
          this.currentOutput += (event.data.text as string) || '';
        }
        this.emit({
          type: event.type as AutoSSEEvent['type'],
          data: event.data,
          timestamp: event.timestamp,
        });
      },
      (info: RateLimitInfo) => {
        // Rate limit handler
        this.handleRateLimit(info);
      },
      (result: { cost_usd: number | null; duration_ms: number | null; output: string; isError: boolean }) => {
        // Completion handler
        this.handleCycleComplete(result);
      },
    );

    this.executor.execute(prompt, session.target_project);
  }

  private handleCycleComplete(result: { cost_usd: number | null; duration_ms: number | null; output: string; isError: boolean }): void {
    if (!this.currentSessionId || !this.currentCycleId) return;

    const session = getAutoSession(this.currentSessionId);
    if (!session) return;

    const now = new Date().toISOString();
    const settings = getAllAutoSettings();

    // Update cycle record
    const cycleStatus: AutoCycleStatus = result.isError ? 'failed' : 'completed';
    updateAutoCycle(this.currentCycleId, {
      status: cycleStatus,
      output: result.output,
      cost_usd: result.cost_usd,
      duration_ms: result.duration_ms,
      completed_at: now,
    });

    // Update session totals
    updateAutoSession(this.currentSessionId, {
      total_cycles: session.total_cycles + 1,
      total_cost_usd: session.total_cost_usd + (result.cost_usd ?? 0),
    });

    // Track consecutive failures
    if (result.isError) {
      this.consecutiveFailures++;
    } else {
      this.consecutiveFailures = 0;
      this.retryCount = 0;
    }

    // Phase-specific result handling
    if (!result.isError) {
      this.handlePhaseResult(result.output);
    } else if (this.currentFindingId) {
      // Fix/improve failed — increment retry count
      const finding = getAutoFinding(this.currentFindingId);
      if (finding) {
        const newRetryCount = finding.retry_count + 1;
        if (newRetryCount >= finding.max_retries) {
          updateAutoFinding(this.currentFindingId, { status: 'wont_fix', retry_count: newRetryCount });
          this.emit({
            type: 'finding_failed',
            data: { findingId: this.currentFindingId, reason: 'max_retries_exceeded' },
            timestamp: now,
          });
        } else {
          updateAutoFinding(this.currentFindingId, { status: 'open', retry_count: newRetryCount });
        }
      }

      // Rollback on failure if auto_commit is enabled
      if (settings.auto_commit) {
        const cycle = getAutoCycle(this.currentCycleId);
        if (cycle?.git_checkpoint) {
          const gitManager = new GitManager(session.target_project);
          gitManager.rollback(cycle.git_checkpoint).then(success => {
            if (success) {
              updateAutoCycle(this.currentCycleId!, { status: 'rolled_back' });
              this.emit({
                type: 'git_rollback',
                data: { checkpoint: cycle.git_checkpoint },
                timestamp: new Date().toISOString(),
              });
            }
          });
        }
      }
    }

    // Emit cycle_complete/cycle_failed
    this.emit({
      type: result.isError ? 'cycle_failed' : 'cycle_complete',
      data: {
        cycleId: this.currentCycleId,
        cycleNumber: this.cycleNumber,
        phase: this.currentPhase,
        cost_usd: result.cost_usd,
        duration_ms: result.duration_ms,
      },
      timestamp: now,
    });

    // Update state for next cycle
    this.lastPhase = this.currentPhase;
    this.lastCycleStatus = cycleStatus;
    this.lastFindingId = this.currentFindingId;
    this.cycleNumber++;
    this.currentCycleId = null;
    this.currentFindingId = null;
    this.executor = null;

    // Write SESSION-STATE.md
    this.updateStateFile();

    // Continue to next cycle
    this.processNextCycle();
  }

  private handlePhaseResult(output: string): void {
    if (!this.currentSessionId) return;

    switch (this.currentPhase) {
      case 'discovery':
      case 'review': {
        // Extract new findings from output
        const extractor = new FindingExtractor();
        const existingFindings = getAutoFindings({ session_id: this.currentSessionId });
        const newFindings = extractor.extract(output, existingFindings);

        for (const f of newFindings) {
          const created = createAutoFinding({
            session_id: this.currentSessionId,
            category: f.category,
            priority: f.priority,
            title: f.title,
            description: f.description,
            file_path: f.file_path,
          });
          this.emit({
            type: 'finding_created',
            data: { finding: created },
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case 'fix':
      case 'improve': {
        // Mark finding as resolved (will be verified by next test phase)
        if (this.currentFindingId) {
          updateAutoFinding(this.currentFindingId, {
            status: 'resolved',
            resolved_by_cycle_id: this.currentCycleId || undefined,
          });
          this.emit({
            type: 'finding_resolved',
            data: { findingId: this.currentFindingId, cycleId: this.currentCycleId },
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case 'test': {
        // Parse test results from output and update cycle
        // Test phase doesn't directly resolve findings, but failed tests
        // will be captured in the next cycle selection
        break;
      }
    }
  }

  private handleRateLimit(info: RateLimitInfo): void {
    if (!this.currentSessionId) return;

    // Update session status
    updateAutoSession(this.currentSessionId, { status: 'waiting_for_limit' });

    // Update cycle
    if (this.currentCycleId) {
      updateAutoCycle(this.currentCycleId, {
        status: 'rate_limited',
        output: this.currentOutput,
        completed_at: new Date().toISOString(),
      });
    }

    // Calculate backoff
    const backoffMs = info.retryAfterMs
      ? info.retryAfterMs
      : Math.min(BACKOFF_BASE_MS * Math.pow(2, this.retryCount), BACKOFF_MAX_MS);
    this.waitingUntil = new Date(Date.now() + backoffMs);

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
    this.currentCycleId = null;
  }

  private retryAfterLimit(): void {
    if (!this.currentSessionId) return;

    this.waitingUntil = null;
    this.retryTimer = null;

    const session = getAutoSession(this.currentSessionId);
    if (!session || session.status === 'stopped' || session.status === 'paused') return;

    updateAutoSession(this.currentSessionId, { status: 'running' });

    this.emit({
      type: 'session_status',
      data: { status: 'running', sessionId: this.currentSessionId },
      timestamp: new Date().toISOString(),
    });

    this.processNextCycle();
  }

  private checkSafetyLimits(): boolean {
    if (!this.currentSessionId) return false;

    const session = getAutoSession(this.currentSessionId);
    if (!session) return false;

    const settings = getAllAutoSettings();

    // Max cycles
    if (settings.max_cycles > 0 && session.total_cycles >= settings.max_cycles) {
      this.completeSession('max_cycles_reached');
      return false;
    }

    // Budget
    if (settings.budget_usd > 0 && session.total_cost_usd >= settings.budget_usd) {
      this.completeSession('budget_exceeded');
      return false;
    }

    // Consecutive failures
    const maxFailures = settings.max_consecutive_failures || MAX_CONSECUTIVE_FAILURES_DEFAULT;
    if (this.consecutiveFailures >= maxFailures) {
      updateAutoSession(this.currentSessionId, { status: 'paused' });
      this.emit({
        type: 'session_status',
        data: { status: 'paused', reason: 'consecutive_failures', sessionId: this.currentSessionId },
        timestamp: new Date().toISOString(),
      });
      this.isPaused = true;
      return false;
    }

    return true;
  }

  private completeSession(reason: string): void {
    if (!this.currentSessionId) return;

    updateAutoSession(this.currentSessionId, { status: 'completed' });
    this.emit({
      type: 'session_status',
      data: { status: 'completed', reason, sessionId: this.currentSessionId },
      timestamp: new Date().toISOString(),
    });

    this.updateStateFile();
    this.resetState();
  }

  private resetState(): void {
    this.currentSessionId = null;
    this.currentCycleId = null;
    this.currentPhase = null;
    this.currentFindingId = null;
    this.cycleNumber = 0;
    this.consecutiveFailures = 0;
    this.isPaused = false;
    this.isStopping = false;
    this.retryCount = 0;
  }

  private async updateStateFile(): Promise<void> {
    if (!this.currentSessionId) return;
    try {
      const session = getAutoSession(this.currentSessionId);
      if (!session) return;
      const cycles = getAutoCyclesBySession(this.currentSessionId);
      const findings = getAutoFindings({ session_id: this.currentSessionId });
      const stateManager = new StateManager(session.target_project);
      await stateManager.writeState(session, cycles, findings);
    } catch {
      // Don't fail the cycle if state file write fails
    }
  }
}

// Global singleton (HMR-safe)
const globalForAutoEngine = globalThis as unknown as { autoEngine: CycleEngineImpl };
export const autoEngine = globalForAutoEngine.autoEngine || new CycleEngineImpl();
globalForAutoEngine.autoEngine = autoEngine;
