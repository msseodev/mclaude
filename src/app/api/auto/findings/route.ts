import { NextRequest, NextResponse } from 'next/server';
import { getAutoFindings, initAutoTables } from '@/lib/autonomous/db';

// GET /api/auto/findings?status=open&priority=P0&category=bug&session_id=...
export async function GET(request: NextRequest) {
  try {
    initAutoTables();
    const url = request.nextUrl;
    const filters: { status?: string; priority?: string; category?: string; session_id?: string } = {};

    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');
    const category = url.searchParams.get('category');
    const sessionId = url.searchParams.get('session_id');

    if (status) filters.status = status;
    if (priority) filters.priority = priority;
    if (category) filters.category = category;
    if (sessionId) filters.session_id = sessionId;

    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const findings = getAutoFindings(filters, limit, offset);
    return NextResponse.json(findings);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch findings' }, { status: 500 });
  }
}
