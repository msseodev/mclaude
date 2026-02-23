'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge, statusBadgeVariant } from '@/components/ui/Badge';
import type { AutoSession } from '@/types';

async function loadSessions(): Promise<AutoSession[]> {
  const res = await fetch('/api/auto/sessions?limit=20&offset=0');
  if (!res.ok) throw new Error('Failed to load sessions');
  return res.json();
}

export default function AutoHistoryPage() {
  const [sessions, setSessions] = useState<AutoSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function fetchSessions() {
    setError(null);
    setLoading(true);
    loadSessions()
      .then((data) => setSessions(data))
      .catch(() => {
        setError('Failed to load session history. Please try again.');
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    loadSessions()
      .then((data) => {
        if (!cancelled) setSessions(data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load session history. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function formatDuration(createdAt: string, updatedAt: string, status: string): string {
    if (status === 'running' || status === 'waiting_for_limit') {
      return 'Running';
    }
    const start = new Date(createdAt).getTime();
    const end = new Date(updatedAt).getTime();
    const diffMs = end - start;
    if (diffMs < 0) return '-';
    if (diffMs < 1000) return `${diffMs}ms`;
    if (diffMs < 60_000) return `${(diffMs / 1000).toFixed(1)}s`;
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ${Math.floor((diffMs % 60_000) / 1000)}s`;
    const hours = Math.floor(diffMs / 3_600_000);
    const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
    return `${hours}h ${minutes}m`;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        Session History
      </h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => fetchSessions()} className="font-medium text-red-700 hover:text-red-900 underline">
            Retry
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            Loading...
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            No autonomous sessions yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 font-medium text-gray-600">
                  Session ID
                </th>
                <th className="px-6 py-3 font-medium text-gray-600">
                  Status
                </th>
                <th className="px-6 py-3 font-medium text-gray-600">
                  Cycles
                </th>
                <th className="px-6 py-3 font-medium text-gray-600">
                  Cost
                </th>
                <th className="px-6 py-3 font-medium text-gray-600">
                  Target Project
                </th>
                <th className="px-6 py-3 font-medium text-gray-600">
                  Created
                </th>
                <th className="px-6 py-3 font-medium text-gray-600">
                  Duration
                </th>
                <th className="px-6 py-3 font-medium text-gray-600" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map((session) => (
                <tr
                  key={session.id}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className="px-6 py-3 font-mono text-gray-900">
                    {session.id.slice(0, 8)}
                  </td>
                  <td className="px-6 py-3">
                    <Badge variant={statusBadgeVariant(session.status)}>
                      {session.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {session.total_cycles}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    ${session.total_cost_usd.toFixed(4)}
                  </td>
                  <td className="px-6 py-3 text-gray-600 max-w-xs truncate" title={session.target_project}>
                    {session.target_project}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {formatDate(session.created_at)}
                  </td>
                  <td className="px-6 py-3 text-gray-600">
                    {formatDuration(session.created_at, session.updated_at, session.status)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Link
                      href={`/auto/cycles?session=${session.id}`}
                      className="text-blue-500 hover:text-blue-600"
                    >
                      View Cycles
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
