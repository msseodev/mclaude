import { NextRequest, NextResponse } from 'next/server';
import { getPlans, createPlan } from '@/lib/db';

export async function GET() {
  try {
    const plans = getPlans();
    return NextResponse.json(plans);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch plans' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, plan_prompt } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    const plan = createPlan(name, description, plan_prompt);
    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create plan' },
      { status: 500 }
    );
  }
}
