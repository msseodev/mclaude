import { NextRequest, NextResponse } from 'next/server';
import { getAutoCycle, initAutoTables } from '@/lib/autonomous/db';

// GET /api/auto/cycles/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    initAutoTables();
    const { id } = await params;
    const cycle = getAutoCycle(id);
    if (!cycle) {
      return NextResponse.json(
        { error: 'Cycle not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(cycle);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch cycle' },
      { status: 500 }
    );
  }
}
