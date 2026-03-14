import { NextRequest, NextResponse } from 'next/server';
import { getLatestAutoSession, createAutoUserPrompt, initAutoTables } from '@/lib/autonomous/db';

// POST /api/auto/report/instruct
export async function POST(request: NextRequest) {
  try {
    initAutoTables();
    const body = await request.json();
    const { content, activeForCycles } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const session = getLatestAutoSession();
    if (!session) {
      return NextResponse.json({ error: 'No active session' }, { status: 404 });
    }

    const prompt = createAutoUserPrompt({
      session_id: session.id,
      content,
      added_at_cycle: session.total_cycles,
      active_for_cycles: activeForCycles || null,
    });

    return NextResponse.json(prompt);
  } catch {
    return NextResponse.json(
      { error: 'Failed to create instruction' },
      { status: 500 }
    );
  }
}
