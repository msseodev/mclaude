import { NextRequest, NextResponse } from 'next/server';
import { getAutoFinding, updateAutoFinding, deleteAutoFinding, initAutoTables } from '@/lib/autonomous/db';

// GET /api/auto/findings/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    initAutoTables();
    const { id } = await params;
    const finding = getAutoFinding(id);
    if (!finding) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }
    return NextResponse.json(finding);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch finding' }, { status: 500 });
  }
}

// PUT /api/auto/findings/:id -- Update finding status/priority
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    initAutoTables();
    const { id } = await params;
    const body = await request.json();

    const allowedFields = ['status', 'priority', 'description', 'retry_count'] as const;
    const update: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        update[field] = body[field];
      }
    }

    const finding = updateAutoFinding(id, update as Partial<Pick<import('@/lib/autonomous/types').AutoFinding, 'status' | 'priority' | 'description' | 'retry_count'>>);
    if (!finding) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }
    return NextResponse.json(finding);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update finding' }, { status: 500 });
  }
}

// DELETE /api/auto/findings/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    initAutoTables();
    const { id } = await params;
    const deleted = deleteAutoFinding(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete finding' }, { status: 500 });
  }
}
