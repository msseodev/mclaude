import { NextRequest, NextResponse } from 'next/server';
import { getAutoCyclesBySession, initAutoTables } from '@/lib/autonomous/db';

// GET /api/auto/cycles?sessionId=...&limit=50&offset=0
export async function GET(request: NextRequest) {
  try {
    initAutoTables();
    const { searchParams } = request.nextUrl;
    const sessionId = searchParams.get('sessionId');
    const rawLimit = parseInt(searchParams.get('limit') ?? '50', 10);
    const rawOffset = parseInt(searchParams.get('offset') ?? '0', 10);
    const limit = Math.max(1, Math.min(Number.isNaN(rawLimit) ? 50 : rawLimit, 500));
    const offset = Math.max(0, Number.isNaN(rawOffset) ? 0 : rawOffset);

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const cycles = getAutoCyclesBySession(sessionId, limit, offset);
    return NextResponse.json(cycles);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch cycles' },
      { status: 500 }
    );
  }
}
