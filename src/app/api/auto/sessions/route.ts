import { NextRequest, NextResponse } from 'next/server';
import { getAutoSessions, initAutoTables } from '@/lib/autonomous/db';

// GET /api/auto/sessions?limit=20&offset=0
export async function GET(request: NextRequest) {
  try {
    initAutoTables();
    const { searchParams } = request.nextUrl;
    const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10);
    const rawOffset = parseInt(searchParams.get('offset') ?? '0', 10);
    const limit = Math.max(1, Math.min(Number.isNaN(rawLimit) ? 20 : rawLimit, 500));
    const offset = Math.max(0, Number.isNaN(rawOffset) ? 0 : rawOffset);

    const sessions = getAutoSessions(limit, offset);
    return NextResponse.json(sessions);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}
