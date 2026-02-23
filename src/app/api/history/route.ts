import { NextRequest, NextResponse } from 'next/server';
import { getRecentExecutions } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const rawLimit = parseInt(searchParams.get('limit') ?? '50', 10);
    const rawOffset = parseInt(searchParams.get('offset') ?? '0', 10);
    const limit = Math.max(1, Math.min(Number.isNaN(rawLimit) ? 50 : rawLimit, 500));
    const offset = Math.max(0, Number.isNaN(rawOffset) ? 0 : rawOffset);

    const executions = getRecentExecutions(limit, offset);
    return NextResponse.json(executions);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch execution history' },
      { status: 500 }
    );
  }
}
