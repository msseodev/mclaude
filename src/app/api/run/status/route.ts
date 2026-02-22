import { NextResponse } from 'next/server';
import { runManager } from '@/lib/run-manager';

export async function GET() {
  try {
    const status = runManager.getStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get run status' },
      { status: 500 }
    );
  }
}
