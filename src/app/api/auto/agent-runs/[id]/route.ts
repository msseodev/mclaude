import { NextRequest, NextResponse } from 'next/server';
import { getAutoAgentRun, initAutoTables } from '@/lib/autonomous/db';

// GET /api/auto/agent-runs/:id
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  initAutoTables();
  const { id } = await params;
  const run = getAutoAgentRun(id);
  if (!run) {
    return NextResponse.json({ error: 'Agent run not found' }, { status: 404 });
  }
  return NextResponse.json(run);
}
