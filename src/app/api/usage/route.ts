import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { checkUsage } from '@/lib/autonomous/usage-checker';

export async function GET() {
  const sessionKey = getSetting('claude_session_key');
  const orgId = getSetting('claude_org_id');

  if (!sessionKey || !orgId) {
    return NextResponse.json({ configured: false });
  }

  try {
    const usage = await checkUsage(sessionKey, orgId);
    return NextResponse.json({
      configured: true,
      utilization: usage.utilization,
      resetsAt: usage.resetsAt?.toISOString() ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ configured: false, error: message });
  }
}
