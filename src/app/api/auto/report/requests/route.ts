import { NextResponse } from 'next/server';
import { getLatestAutoSession, getCEORequests, initAutoTables } from '@/lib/autonomous/db';

// GET /api/auto/report/requests
export async function GET() {
  try {
    initAutoTables();
    const session = getLatestAutoSession();
    if (!session) {
      return NextResponse.json({ error: 'No session found' }, { status: 404 });
    }
    const requests = getCEORequests(session.id);
    return NextResponse.json(requests);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch CEO requests' },
      { status: 500 }
    );
  }
}
