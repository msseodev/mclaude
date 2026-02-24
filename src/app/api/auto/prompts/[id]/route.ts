import { NextRequest, NextResponse } from 'next/server';
import { deleteAutoUserPrompt, initAutoTables } from '@/lib/autonomous/db';

// DELETE /api/auto/prompts/:id
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  initAutoTables();
  const { id } = await params;
  const deleted = deleteAutoUserPrompt(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
