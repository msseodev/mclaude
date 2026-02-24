import { NextRequest, NextResponse } from 'next/server';
import { getAutoAgent, updateAutoAgent, deleteAutoAgent, initAutoTables } from '@/lib/autonomous/db';

// GET /api/auto/agents/:id
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  initAutoTables();
  const { id } = await params;
  const agent = getAutoAgent(id);
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }
  return NextResponse.json(agent);
}

// PUT /api/auto/agents/:id
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  initAutoTables();
  const { id } = await params;
  try {
    const body = await request.json();
    const updated = updateAutoAgent(id, body);
    if (!updated) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update agent';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/auto/agents/:id
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  initAutoTables();
  const { id } = await params;
  const agent = getAutoAgent(id);
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }
  if (agent.is_builtin) {
    return NextResponse.json({ error: 'Cannot delete built-in agent' }, { status: 400 });
  }
  deleteAutoAgent(id);
  return NextResponse.json({ success: true });
}
