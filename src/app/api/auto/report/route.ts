import { NextRequest, NextResponse } from 'next/server';
import {
  getLatestAutoSession,
  getAutoSession,
  getAutoCyclesBySession,
  getAutoFindings,
  initAutoTables,
} from '@/lib/autonomous/db';
import type { AutoCycle } from '@/lib/autonomous/types';

function calculateAvgScore(cycles: AutoCycle[]): number | null {
  const scored = cycles.filter(c => c.composite_score != null);
  if (scored.length === 0) return null;
  const sum = scored.reduce((acc, c) => acc + (c.composite_score ?? 0), 0);
  return Math.round(sum / scored.length);
}

function calculateSuccessRate(cycles: AutoCycle[]): number | null {
  if (cycles.length === 0) return null;
  const completed = cycles.filter(c => c.status === 'completed').length;
  return Math.round((completed / cycles.length) * 100);
}

// GET /api/auto/report?sessionId=xxx
export async function GET(request: NextRequest) {
  try {
    initAutoTables();
    const { searchParams } = request.nextUrl;
    const sessionId = searchParams.get('sessionId');

    const session = sessionId ? getAutoSession(sessionId) : getLatestAutoSession();
    if (!session) {
      return NextResponse.json({ error: 'No session found' }, { status: 404 });
    }

    const cycles = getAutoCyclesBySession(session.id);
    const findings = getAutoFindings({ session_id: session.id });

    const report = {
      session: {
        id: session.id,
        status: session.status,
        targetProject: session.target_project,
        totalCycles: session.total_cycles,
        totalCost: session.total_cost_usd,
        startedAt: session.created_at,
      },
      summary: {
        completedCycles: cycles.filter(c => c.status === 'completed').length,
        failedCycles: cycles.filter(c => c.status === 'failed').length,
        avgScore: calculateAvgScore(cycles),
        successRate: calculateSuccessRate(cycles),
      },
      findings: {
        total: findings.length,
        resolved: findings.filter(f => f.status === 'resolved').length,
        open: findings.filter(f => f.status === 'open').length,
        inProgress: findings.filter(f => f.status === 'in_progress').length,
        wontFix: findings.filter(f => f.status === 'wont_fix').length,
        byPriority: {
          P0: findings.filter(f => f.priority === 'P0').length,
          P1: findings.filter(f => f.priority === 'P1').length,
          P2: findings.filter(f => f.priority === 'P2').length,
          P3: findings.filter(f => f.priority === 'P3').length,
        },
        items: findings.map(f => ({
          id: f.id,
          title: f.title,
          category: f.category,
          priority: f.priority,
          status: f.status,
          retryCount: f.retry_count,
        })),
      },
      recentCycles: cycles.slice(-10).reverse().map(c => ({
        number: c.cycle_number,
        phase: c.phase,
        status: c.status,
        score: c.composite_score,
        cost: c.cost_usd,
        duration: c.duration_ms,
        completedAt: c.completed_at,
      })),
    };

    return NextResponse.json(report);
  } catch {
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}
