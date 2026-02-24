import { NextRequest, NextResponse } from 'next/server';
import { reorderAutoAgents, initAutoTables } from '@/lib/autonomous/db';

// PUT /api/auto/agents/reorder
export async function PUT(request: NextRequest) {
  initAutoTables();
  try {
    const body = await request.json();
    const { orderedPairs } = body;
    if (!Array.isArray(orderedPairs)) {
      return NextResponse.json({ error: 'orderedPairs array is required' }, { status: 400 });
    }
    reorderAutoAgents(orderedPairs);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reorder agents';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
