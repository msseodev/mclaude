'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSSE } from '@/hooks/useSSE';
import { useAutoStatus } from '@/hooks/useAutoStatus';
import { Button } from '@/components/ui/Button';
import { Badge, statusBadgeVariant } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import type { AutoSSEEvent } from '@/types';

const MAX_OUTPUT_ENTRIES = 10000;

interface RecentCycle {
  cycle_number: number;
  phase: string;
  finding_id: string | null;
  status: string;
  cost_usd: number | null;
  duration_ms: number | null;
}

export default function AutoDashboardPage() {
  const { status, refresh } = useAutoStatus();
  const { showToast } = useToast();
  const [output, setOutput] = useState<Array<{ type: string; text: string }>>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [recentCycles, setRecentCycles] = useState<RecentCycle[]>([]);

  const outputRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const fetchCyclesRef = useRef<() => void>(() => {});

  const sessionStatus = status?.status ?? 'idle';

  // Fetch recent cycles
  const fetchRecentCycles = useCallback(async () => {
    if (!status?.sessionId) return;
    try {
      const res = await fetch(`/api/auto/cycles?sessionId=${status.sessionId}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setRecentCycles(data);
      }
    } catch {
      // ignore
    }
  }, [status?.sessionId]);

  useEffect(() => {
    fetchCyclesRef.current = fetchRecentCycles;
  }, [fetchRecentCycles]);

  // SSE event handler
  const handleSSEEvent = useCallback(
    (event: AutoSSEEvent) => {
      switch (event.type) {
        case 'text_delta': {
          const text = String(event.data.text ?? '');
          setOutput((prev) => {
            // Coalesce consecutive text entries
            if (prev.length > 0 && prev[prev.length - 1].type === 'text') {
              const updated = [...prev];
              updated[updated.length - 1] = {
                type: 'text',
                text: updated[updated.length - 1].text + text,
              };
              return updated.length > MAX_OUTPUT_ENTRIES
                ? updated.slice(-MAX_OUTPUT_ENTRIES)
                : updated;
            }
            const next = [...prev, { type: 'text', text }];
            return next.length > MAX_OUTPUT_ENTRIES
              ? next.slice(-MAX_OUTPUT_ENTRIES)
              : next;
          });
          break;
        }
        case 'tool_start': {
          const name = String(event.data.name ?? 'tool');
          setOutput((prev) => [
            ...prev,
            { type: 'tool_start', text: `--- Tool: ${name} ---` },
          ]);
          break;
        }
        case 'tool_end': {
          const name = String(event.data.name ?? 'tool');
          setOutput((prev) => [
            ...prev,
            { type: 'tool_end', text: `--- End: ${name} ---` },
          ]);
          break;
        }
        case 'cycle_start': {
          const cycleNumber = event.data.cycleNumber ?? event.data.cycle_number ?? '?';
          const phase = event.data.phase ?? '';
          setOutput([
            { type: 'cycle_start', text: `\n========== Cycle #${cycleNumber} — Phase: ${phase} ==========\n` },
          ]);
          refresh();
          break;
        }
        case 'cycle_complete':
        case 'cycle_failed': {
          const label = event.type === 'cycle_complete' ? 'COMPLETED' : 'FAILED';
          const cycleNumber = event.data.cycleNumber ?? event.data.cycle_number ?? '?';
          setOutput((prev) => [
            ...prev,
            { type: event.type, text: `\n========== ${label}: Cycle #${cycleNumber} ==========\n` },
          ]);
          refresh();
          fetchCyclesRef.current();
          break;
        }
        case 'finding_created':
        case 'finding_resolved':
        case 'finding_failed':
          refresh();
          break;
        case 'phase_change': {
          const phase = event.data.phase ?? '';
          setOutput((prev) => [
            ...prev,
            { type: 'phase_change', text: `\n--- Phase: ${phase} ---\n` },
          ]);
          refresh();
          break;
        }
        case 'rate_limit':
        case 'session_status':
        case 'error':
        case 'test_result':
        case 'git_checkpoint':
        case 'git_rollback':
          refresh();
          break;
      }
    },
    [refresh]
  );

  const handleReconnect = useCallback(() => {
    setOutput([]); // Clear on reconnection to prevent duplicates
    refresh();
  }, [refresh]);

  // SSE connection -- cast handler since useSSE expects SSEEvent but we handle AutoSSEEvent
  const { connected } = useSSE(
    '/api/auto/stream',
    handleSSEEvent as unknown as (event: import('@/types').SSEEvent) => void,
    handleReconnect
  );

  useEffect(() => {
    fetchRecentCycles();
  }, [fetchRecentCycles]);

  // Auto-scroll output
  useEffect(() => {
    const el = outputRef.current;
    if (el && autoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [output]);

  // Control handlers
  async function handleStart() {
    setActionLoading(true);
    try {
      const res = await fetch('/api/auto', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to start', 'error');
        return;
      }
      showToast('Autonomous mode started', 'success');
      setOutput([]);
      await refresh();
    } catch {
      showToast('Failed to start autonomous mode', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStop() {
    setActionLoading(true);
    try {
      const res = await fetch('/api/auto', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to stop', 'error');
      } else {
        showToast('Autonomous mode stopped', 'success');
      }
      await refresh();
    } catch {
      showToast('Failed to stop', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePause() {
    setActionLoading(true);
    try {
      const res = await fetch('/api/auto', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to pause', 'error');
      } else {
        showToast('Paused', 'success');
      }
      await refresh();
    } catch {
      showToast('Failed to pause', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResume() {
    setActionLoading(true);
    try {
      const res = await fetch('/api/auto', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to resume', 'error');
      } else {
        showToast('Resumed', 'success');
      }
      await refresh();
    } catch {
      showToast('Failed to resume', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  const canStart = sessionStatus === 'idle' || sessionStatus === 'completed' || sessionStatus === 'stopped';

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Autonomous Mode</h1>
          <Badge variant={statusBadgeVariant(sessionStatus)}>
            {sessionStatus}
          </Badge>
          {connected && sessionStatus !== 'idle' && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canStart && (
            <Button onClick={handleStart} loading={actionLoading} variant="success">
              Start
            </Button>
          )}
          {sessionStatus === 'running' && (
            <>
              <Button variant="secondary" onClick={handlePause} loading={actionLoading}>
                Pause
              </Button>
              <Button variant="danger" onClick={handleStop} loading={actionLoading}>
                Stop
              </Button>
            </>
          )}
          {sessionStatus === 'paused' && (
            <>
              <Button onClick={handleResume} loading={actionLoading} variant="success">
                Resume
              </Button>
              <Button variant="danger" onClick={handleStop} loading={actionLoading}>
                Stop
              </Button>
            </>
          )}
          {sessionStatus === 'waiting_for_limit' && (
            <Button onClick={handleStop} loading={actionLoading} variant="danger">
              Stop
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Cycles" value={status?.stats.totalCycles ?? 0} />
        <StatCard label="Open Findings" value={status?.stats.findingsOpen ?? 0} />
        <StatCard label="Resolved" value={status?.stats.findingsResolved ?? 0} />
        <StatCard label="Total Cost" value={`$${(status?.stats.totalCostUsd ?? 0).toFixed(2)}`} />
      </div>

      {/* Rate Limit Banner */}
      {sessionStatus === 'waiting_for_limit' && status?.waitingUntil && (
        <RateLimitBanner
          waitingUntil={status.waitingUntil}
          retryCount={status.retryCount}
        />
      )}

      {/* Current Cycle Panel */}
      {sessionStatus !== 'idle' && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-medium text-gray-700">
              Cycle #{status?.currentCycle ?? 0} — Phase: {status?.currentPhase ?? '—'}
            </h2>
            {status?.currentFinding && (
              <span className="text-xs text-gray-500">
                Finding: {status.currentFinding.title}
              </span>
            )}
          </div>
          <OutputViewer entries={output} outputRef={outputRef} autoScrollRef={autoScrollRef} />
        </div>
      )}

      {/* Recent Cycles Table */}
      {recentCycles.length > 0 && (
        <div className="mt-2">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Recent Cycles</h2>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">#</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Phase</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Finding</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Cost</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {recentCycles.map((cycle) => (
                  <tr key={cycle.cycle_number}>
                    <td className="px-4 py-2 text-sm text-gray-900">{cycle.cycle_number}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{cycle.phase}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {cycle.finding_id ? cycle.finding_id.slice(0, 8) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={statusBadgeVariant(cycle.status)}>{cycle.status}</Badge>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {cycle.cost_usd != null ? `$${cycle.cost_usd.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {cycle.duration_ms != null ? `${(cycle.duration_ms / 1000).toFixed(1)}s` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// --- StatCard ---

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

// --- RateLimitBanner ---

function RateLimitBanner({
  waitingUntil,
  retryCount,
}: {
  waitingUntil: string;
  retryCount: number;
}) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    function update() {
      const diff = new Date(waitingUntil).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining('resuming...');
        return;
      }
      const secs = Math.ceil(diff / 1000);
      const mins = Math.floor(secs / 60);
      const s = secs % 60;
      setRemaining(mins > 0 ? `${mins}m ${s}s` : `${s}s`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [waitingUntil]);

  return (
    <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3">
      <div className="flex items-center gap-2">
        <svg
          className="h-5 w-5 text-yellow-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-sm font-medium text-yellow-800">
          Rate limit reached. Retrying in {remaining}
          {retryCount > 0 && ` (attempt ${retryCount})`}
        </span>
      </div>
    </div>
  );
}

// --- OutputViewer ---

function OutputViewer({
  entries,
  outputRef,
  autoScrollRef,
}: {
  entries: Array<{ type: string; text: string }>;
  outputRef: React.RefObject<HTMLDivElement | null>;
  autoScrollRef: React.MutableRefObject<boolean>;
}) {
  function handleScroll() {
    const el = outputRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = atBottom;
  }

  const colorForType = (type: string) => {
    switch (type) {
      case 'tool_start':
      case 'tool_end':
        return 'text-blue-400';
      case 'cycle_start':
      case 'phase_change':
        return 'text-green-400 font-bold';
      case 'cycle_complete':
        return 'text-green-400';
      case 'cycle_failed':
        return 'text-red-400';
      default:
        return 'text-gray-100';
    }
  };

  return (
    <div
      ref={outputRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-lg p-4 font-mono text-sm leading-relaxed"
      style={{ backgroundColor: '#1E1E1E', minHeight: 300 }}
    >
      {entries.length === 0 ? (
        <p className="text-gray-500">
          Waiting for output...
        </p>
      ) : (
        entries.map((entry, i) => (
          <span key={i} className={colorForType(entry.type)}>
            {entry.text}
          </span>
        ))
      )}
    </div>
  );
}
