import { NextRequest, NextResponse } from 'next/server';
import { reorderPlanItems } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    reorderPlanItems(id, orderedIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to reorder plan items' },
      { status: 500 }
    );
  }
}
