import { NextRequest, NextResponse } from 'next/server';
import { runManager } from '@/lib/run-manager';

export async function POST(request: NextRequest) {
  try {
    let startFromPromptId: string | undefined;
    try {
      const body = await request.json();
      startFromPromptId = body.startFromPromptId;
    } catch {
      // No body or invalid JSON is fine — start from beginning
    }
    await runManager.startQueue(startFromPromptId);
    const status = runManager.getStatus();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start queue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await runManager.stopQueue();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to stop queue' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'pause') {
      await runManager.pauseQueue();
      return NextResponse.json({ success: true });
    } else if (action === 'resume') {
      await runManager.resumeQueue();
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: 'action must be "pause" or "resume"' },
        { status: 400 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update queue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
