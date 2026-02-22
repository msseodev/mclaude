import { NextRequest, NextResponse } from 'next/server';
import { getRecentExecutions } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    const executions = getRecentExecutions(limit, offset);
    return NextResponse.json(executions);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch execution history' },
      { status: 500 }
    );
  }
}
