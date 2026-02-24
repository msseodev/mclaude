import { NextRequest, NextResponse } from 'next/server';
import { autoEngine } from '@/lib/autonomous/cycle-engine';
import { getAutoUserPrompts, createAutoUserPrompt, initAutoTables } from '@/lib/autonomous/db';

// GET /api/auto/prompts?sessionId=...
export async function GET(request: NextRequest) {
  initAutoTables();
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const status = autoEngine.getStatus();
  const effectiveSessionId = sessionId || status.sessionId;
  if (!effectiveSessionId) {
    return NextResponse.json([]);
  }
  const prompts = getAutoUserPrompts(effectiveSessionId);
  return NextResponse.json(prompts);
}

// POST /api/auto/prompts — Add mid-session prompt
export async function POST(request: NextRequest) {
  initAutoTables();
  try {
    const body = await request.json();
    const { content } = body;
    if (!content?.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }
    const status = autoEngine.getStatus();
    if (!status.sessionId) {
      return NextResponse.json({ error: 'No active session' }, { status: 400 });
    }
    const prompt = createAutoUserPrompt({
      session_id: status.sessionId,
      content: content.trim(),
      added_at_cycle: status.currentCycle,
    });
    autoEngine.emitUserPromptAdded(prompt);
    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add prompt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
