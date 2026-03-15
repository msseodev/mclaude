import { NextRequest, NextResponse } from 'next/server';
import { respondToCEORequest, initAutoTables } from '@/lib/autonomous/db';
import type { CEORequestStatus } from '@/lib/autonomous/types';

const VALID_STATUSES = new Set(['approved', 'rejected', 'answered']);

// PATCH /api/auto/report/requests/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    initAutoTables();
    const { id } = await params;
    const body = await request.json();
    const { status, response } = body;

    if (!status || !VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { error: 'status must be one of: approved, rejected, answered' },
        { status: 400 }
      );
    }

    if (!response || typeof response !== 'string') {
      return NextResponse.json(
        { error: 'response is required' },
        { status: 400 }
      );
    }

    const updated = respondToCEORequest(id, {
      status: status as CEORequestStatus,
      ceo_response: response,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: 'Failed to respond to CEO request' },
      { status: 500 }
    );
  }
}
