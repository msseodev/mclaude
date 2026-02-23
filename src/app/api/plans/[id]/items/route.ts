import { NextRequest, NextResponse } from 'next/server';
import { getPlan, addPlanItem } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plan = getPlan(id);
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const body = await request.json();
    const { prompt_id } = body;

    if (!prompt_id) {
      return NextResponse.json(
        { error: 'prompt_id is required' },
        { status: 400 }
      );
    }

    const item = addPlanItem(id, prompt_id);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to add plan item' },
      { status: 500 }
    );
  }
}
