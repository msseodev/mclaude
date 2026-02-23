import { NextRequest, NextResponse } from 'next/server';
import { getAutoSession, initAutoTables } from '@/lib/autonomous/db';

// GET /api/auto/sessions/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    initAutoTables();
    const { id } = await params;
    const session = getAutoSession(id);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch session' },
      { status: 500 }
    );
  }
}
