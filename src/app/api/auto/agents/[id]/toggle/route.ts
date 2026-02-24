import { NextRequest, NextResponse } from 'next/server';
import { toggleAutoAgent, initAutoTables } from '@/lib/autonomous/db';

// PATCH /api/auto/agents/:id/toggle
export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  initAutoTables();
  const { id } = await params;
  const agent = toggleAutoAgent(id);
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }
  return NextResponse.json(agent);
}
