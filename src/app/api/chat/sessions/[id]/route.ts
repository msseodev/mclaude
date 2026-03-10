import { NextRequest, NextResponse } from 'next/server';
import { chatManager } from '@/lib/chat-manager';
import { getChatSession } from '@/lib/db';

// GET /api/chat/sessions/[id] - Get session with messages
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = getChatSession(id);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const messages = chatManager.getMessages(id);
  return NextResponse.json({ ...session, messages });
}

// DELETE /api/chat/sessions/[id] - Delete a session
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  chatManager.removeSession(id);
  return NextResponse.json({ ok: true });
}
