import { NextRequest, NextResponse } from 'next/server';
import { getAutoAgents, createAutoAgent, initAutoTables } from '@/lib/autonomous/db';

// GET /api/auto/agents
export async function GET() {
  initAutoTables();
  const agents = getAutoAgents();
  return NextResponse.json(agents);
}

// POST /api/auto/agents — Create custom agent
export async function POST(request: NextRequest) {
  initAutoTables();
  try {
    const body = await request.json();
    const { name, display_name, role_description, system_prompt, pipeline_order } = body;
    if (!name || !display_name || !system_prompt) {
      return NextResponse.json({ error: 'name, display_name, and system_prompt are required' }, { status: 400 });
    }
    const agent = createAutoAgent({
      name,
      display_name,
      role_description: role_description || '',
      system_prompt,
      pipeline_order: pipeline_order ?? 99,
    });
    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create agent';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
