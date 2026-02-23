import { NextRequest, NextResponse } from 'next/server';
import { removePlanItem } from '@/lib/db';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const removed = removePlanItem(itemId);
    if (!removed) {
      return NextResponse.json({ error: 'Plan item not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to remove plan item' },
      { status: 500 }
    );
  }
}
