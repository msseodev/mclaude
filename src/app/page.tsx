'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRunStatus } from '@/hooks/useRunStatus';
import { Button } from '@/components/ui/Button';
import { Badge, statusBadgeVariant } from '@/components/ui/Badge';
import type { Execution } from '@/types';

const statusLabels: Record<string, string> = {
  idle: 'Idle',
  running: 'Running',
  paused: 'Paused',
  waiting_for_limit: 'Waiting (Rate Limit)',
  completed: 'Completed',
  stopped: 'Stopped',
};

const statusDotColors: Record<string, string> = {
  idle: 'bg-gray-400',
  running: 'bg-green-500',
  paused: 'bg-yellow-500',
  waiting_for_limit: 'bg-yellow-500',
  completed: 'bg-blue-500',
  stopped: 'bg-red-500',
};

export default function DashboardPage() {
  const { status, isLoading } = useRunStatus();
  const [recentExecutions, setRecentExecutions] = useState<Execution[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/history');
      if (!res.ok) throw new Error('Failed to load history');
      const data: Execution[] = await res.json();
      setRecentExecutions(data.slice(0, 5));
      setError(null);
    } catch {
      setError('Failed to load recent executions. Please try again.');
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const sessionStatus = status?.status ?? 'idle';

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => { setError(null); fetchHistory(); }} className="font-medium text-red-700 hover:text-red-900 underline">
            Retry
          </button>
        </div>
      )}

      {/* Status Card */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full ${statusDotColors[sessionStatus] ?? 'bg-gray-400'}`}
          />
          <h2 className="text-lg font-semibold text-gray-900">
            Queue Status: {statusLabels[sessionStatus] ?? sessionStatus}
          </h2>
        </div>

        {status && sessionStatus !== 'idle' && (
          <div className="mb-4 text-sm text-gray-600">
            {status.planName && (
              <p className="font-medium text-blue-600">Plan: {status.planName}</p>
            )}
            <p>
              Progress: {status.completedCount} / {status.totalCount} prompts
            </p>
            {status.currentPromptTitle && (
              <p>Current: {status.currentPromptTitle}</p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          {sessionStatus === 'idle' && (
            <Link href="/run">
              <Button variant="primary">Start Queue</Button>
            </Link>
          )}
          {sessionStatus === 'running' && (
            <Link href="/run">
              <Button variant="secondary">View Execution</Button>
            </Link>
          )}
          <Link href="/prompts">
            <Button variant="secondary">Manage Prompts</Button>
          </Link>
          <Link href="/plans">
            <Button variant="secondary">Manage Plans</Button>
          </Link>
        </div>
      </div>

      {/* Recent Executions */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Executions
          </h2>
        </div>

        {recentExecutions.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            No executions yet. Add prompts and start the queue.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentExecutions.map((exec) => (
              <div
                key={exec.id}
                className="flex items-center justify-between px-6 py-3"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={statusBadgeVariant(exec.status)}>
                    {exec.status}
                  </Badge>
                  <span className="text-sm font-medium text-gray-900">
                    {exec.prompt_title ?? exec.prompt_id.slice(0, 8)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  {exec.duration_ms != null && (
                    <span>{(exec.duration_ms / 1000).toFixed(1)}s</span>
                  )}
                  {exec.cost_usd != null && (
                    <span>${exec.cost_usd.toFixed(4)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {recentExecutions.length > 0 && (
          <div className="border-t border-gray-200 px-6 py-3">
            <Link
              href="/history"
              className="text-sm font-medium text-blue-500 hover:text-blue-600"
            >
              View all history
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
