import { NextRequest, NextResponse } from 'next/server';
import { reorderPrompts } from '@/lib/db';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderedIds } = body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json(
        { error: 'orderedIds must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!orderedIds.every((id: unknown) => typeof id === 'string')) {
      return NextResponse.json(
        { error: 'orderedIds must contain only strings' },
        { status: 400 }
      );
    }

    reorderPrompts(orderedIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to reorder prompts' },
      { status: 500 }
    );
  }
}
