'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import type { BadgeVariant } from '@/components/ui/Badge';

// --- Korean translation maps ---

const statusLabel: Record<string, string> = {
  resolved: '해결됨',
  open: '미해결',
  in_progress: '진행중',
  wont_fix: '포기',
  duplicate: '중복',
};

const categoryLabel: Record<string, string> = {
  bug: '버그',
  improvement: '개선',
  idea: '아이디어',
  test_failure: '테스트 실패',
  performance: '성능',
  accessibility: '접근성',
  security: '보안',
};

const priorityLabel: Record<string, string> = {
  P0: '긴급',
  P1: '높음',
  P2: '보통',
  P3: '낮음',
};

const phaseLabel: Record<string, string> = {
  discovery: '탐색',
  fix: '수정',
  test: '테스트',
  improve: '개선',
  review: '리뷰',
  pipeline: '파이프라인',
};

const cycleStatusLabel: Record<string, string> = {
  completed: '완료',
  failed: '실패',
  running: '실행중',
  rate_limited: '속도 제한',
  rolled_back: '롤백',
};

const sessionStatusLabel: Record<string, string> = {
  running: '실행중',
  paused: '일시정지',
  waiting_for_limit: '속도 제한 대기',
  completed: '완료',
  stopped: '중단',
};

// --- Badge variant helpers ---

function findingStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'resolved': return 'green';
    case 'open': return 'red';
    case 'in_progress': return 'blue';
    case 'wont_fix': return 'gray';
    case 'duplicate': return 'gray';
    default: return 'gray';
  }
}

function priorityBadgeVariant(priority: string): BadgeVariant {
  switch (priority) {
    case 'P0': return 'red';
    case 'P1': return 'yellow';
    case 'P2': return 'blue';
    case 'P3': return 'green';
    default: return 'gray';
  }
}

function cycleStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'completed': return 'green';
    case 'failed': return 'red';
    case 'running': return 'blue';
    case 'rate_limited': return 'yellow';
    case 'rolled_back': return 'yellow';
    default: return 'gray';
  }
}

// --- Types ---

interface ReportData {
  session: {
    id: string;
    status: string;
    targetProject: string;
    totalCycles: number;
    totalCost: number;
    startedAt: string;
  };
  summary: {
    completedCycles: number;
    failedCycles: number;
    avgScore: number | null;
    successRate: number | null;
  };
  findings: {
    total: number;
    resolved: number;
    open: number;
    inProgress: number;
    wontFix: number;
    byPriority: {
      P0: number;
      P1: number;
      P2: number;
      P3: number;
    };
    items: Array<{
      id: string;
      title: string;
      category: string;
      priority: string;
      status: string;
      retryCount: number;
    }>;
  };
  recentCycles: Array<{
    number: number;
    phase: string;
    status: string;
    score: number | null;
    cost: number | null;
    duration: number | null;
    completedAt: string | null;
  }>;
}

// --- Helper functions ---

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return '\u2014';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '\u2014';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}분 ${secs}초`;
}

// --- Main page component ---

export default function AutoReportPage() {
  const { showToast } = useToast();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Instruction form state
  const [instruction, setInstruction] = useState('');
  const [isPermanent, setIsPermanent] = useState(true);
  const [cycleCount, setCycleCount] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch('/api/auto/report');
      if (res.status === 404) {
        setReport(null);
        setError(null);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        throw new Error('Failed to fetch report');
      }
      const data: ReportData = await res.json();
      setReport(data);
      setError(null);
      setLastRefreshed(new Date());
    } catch {
      setError('보고서를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Auto-refresh every 30 seconds when session is running
  useEffect(() => {
    if (report?.session.status === 'running') {
      intervalRef.current = setInterval(fetchReport, 30000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [report?.session.status, fetchReport]);

  async function handleSubmitInstruction() {
    if (!instruction.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/auto/report/instruct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: instruction.trim(),
          activeForCycles: isPermanent ? null : cycleCount,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || '지시사항 전송에 실패했습니다.', 'error');
        return;
      }
      showToast('지시사항이 전송되었습니다.', 'success');
      setInstruction('');
    } catch {
      showToast('지시사항 전송에 실패했습니다.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">자율 작업 보고서</h1>
        <p className="text-sm text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">자율 작업 보고서</h1>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">진행중인 세션이 없습니다.</p>
          <p className="mt-2 text-sm text-gray-400">
            자율 모드를 시작하면 보고서가 여기에 표시됩니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">자율 작업 보고서</h1>
          <p className="mt-1 text-sm text-gray-500">
            세션: {report.session.id.slice(0, 8)}...
            {' | '}
            상태: {sessionStatusLabel[report.session.status] ?? report.session.status}
            {' | '}
            시작: {formatDateTime(report.session.startedAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-gray-400">
              마지막 갱신: {lastRefreshed.toLocaleTimeString('ko-KR')}
            </span>
          )}
          {report.session.status === 'running' && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              자동 갱신
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={fetchReport}>
            새로고침
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchReport} className="font-medium text-red-700 hover:text-red-900 underline">
            재시도
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="총 사이클" value={report.session.totalCycles} />
        <SummaryCard
          label="성공률"
          value={report.summary.successRate != null ? `${report.summary.successRate}%` : '\u2014'}
        />
        <SummaryCard
          label="평균 점수"
          value={report.summary.avgScore != null ? `${report.summary.avgScore}/100` : '\u2014'}
        />
        <SummaryCard label="총 비용" value={`$${report.session.totalCost.toFixed(2)}`} />
      </div>

      {/* Findings Section */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">발견 항목 현황</h2>

        {/* Status Summary */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md bg-green-50 p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{report.findings.resolved}</p>
            <p className="text-xs text-green-600">해결됨</p>
          </div>
          <div className="rounded-md bg-blue-50 p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{report.findings.inProgress}</p>
            <p className="text-xs text-blue-600">진행중</p>
          </div>
          <div className="rounded-md bg-red-50 p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{report.findings.open}</p>
            <p className="text-xs text-red-600">미해결</p>
          </div>
          <div className="rounded-md bg-gray-50 p-3 text-center">
            <p className="text-2xl font-bold text-gray-700">{report.findings.wontFix}</p>
            <p className="text-xs text-gray-600">포기</p>
          </div>
        </div>

        {/* Priority Breakdown */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-700">우선순위:</span>
          <Badge variant="red">P0 긴급: {report.findings.byPriority.P0}건</Badge>
          <Badge variant="yellow">P1 높음: {report.findings.byPriority.P1}건</Badge>
          <Badge variant="blue">P2 보통: {report.findings.byPriority.P2}건</Badge>
          <Badge variant="green">P3 낮음: {report.findings.byPriority.P3}건</Badge>
        </div>

        {/* Findings Table */}
        {report.findings.items.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">상태</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">우선순위</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">카테고리</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">제목</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">시도</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {report.findings.items.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-2">
                      <Badge variant={findingStatusBadgeVariant(f.status)}>
                        {statusLabel[f.status] ?? f.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={priorityBadgeVariant(f.priority)}>
                        {f.priority} {priorityLabel[f.priority] ?? ''}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {categoryLabel[f.category] ?? f.category}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">{f.title}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{f.retryCount}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">발견 항목이 없습니다.</p>
        )}
      </div>

      {/* Recent Cycles */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">최근 작업 내역</h2>

        {report.recentCycles.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">#</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">단계</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">상태</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">점수</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">비용</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">소요시간</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">완료시간</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {report.recentCycles.map((c) => (
                  <tr key={c.number}>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{c.number}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {phaseLabel[c.phase] ?? c.phase}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={cycleStatusBadgeVariant(c.status)}>
                        {cycleStatusLabel[c.status] ?? c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {c.score != null ? c.score : '\u2014'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {c.cost != null ? `$${c.cost.toFixed(2)}` : '\u2014'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {formatDuration(c.duration)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {formatTime(c.completedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">작업 내역이 없습니다.</p>
        )}
      </div>

      {/* Instruction Input */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">새 지시사항</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="report-instruction" className="mb-1 block text-sm font-medium text-gray-700">
              지시 내용
            </label>
            <textarea
              id="report-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="새로운 작업 방향이나 지시사항을 입력하세요..."
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                id="report-permanent"
                type="checkbox"
                checked={isPermanent}
                onChange={(e) => setIsPermanent(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              />
              <label htmlFor="report-permanent" className="text-sm text-gray-700">
                영구 적용
              </label>
            </div>

            {!isPermanent && (
              <div className="flex items-center gap-2">
                <label htmlFor="report-cycle-count" className="text-sm text-gray-700">
                  사이클 수:
                </label>
                <input
                  id="report-cycle-count"
                  type="number"
                  min={1}
                  value={cycleCount}
                  onChange={(e) => setCycleCount(parseInt(e.target.value, 10) || 1)}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSubmitInstruction}
              loading={submitting}
              disabled={!instruction.trim()}
            >
              전송
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- SummaryCard ---

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
