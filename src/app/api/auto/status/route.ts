import { NextResponse } from 'next/server';
import { autoEngine } from '@/lib/autonomous/cycle-engine';

export async function GET() {
  return NextResponse.json(autoEngine.getStatus());
}
