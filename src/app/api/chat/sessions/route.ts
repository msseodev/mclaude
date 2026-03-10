import { NextResponse } from 'next/server';
import { chatManager } from '@/lib/chat-manager';

export const dynamic = 'force-dynamic';

// GET /api/chat/sessions - List all chat sessions
export async function GET() {
  const sessions = chatManager.getSessions();
  return NextResponse.json(sessions);
}
