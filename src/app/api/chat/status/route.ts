import { NextResponse } from 'next/server';
import { chatManager } from '@/lib/chat-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(chatManager.getStatus());
}
