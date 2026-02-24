import { NextRequest, NextResponse } from 'next/server';
import { getAutoAgentRunsByCycle, initAutoTables } from '@/lib/autonomous/db';

// GET /api/auto/agent-runs?cycleId=...
export async function GET(request: NextRequest) {
  initAutoTables();
  const cycleId = request.nextUrl.searchParams.get('cycleId');
  if (!cycleId) {
    return NextResponse.json({ error: 'cycleId query parameter is required' }, { status: 400 });
  }
  const runs = getAutoAgentRunsByCycle(cycleId);
  return NextResponse.json(runs);
}
