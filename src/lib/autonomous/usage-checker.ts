export interface UsageResult {
  utilization: number;
  resetsAt: Date | null;
}

const BUFFER_MS = 60 * 1000; // 60 seconds

export function getWaitTimeMs(resetsAt: Date): number {
  const ms = resetsAt.getTime() - Date.now() + BUFFER_MS;
  return Math.max(ms, BUFFER_MS);
}

export async function checkUsage(sessionKey: string, orgId: string): Promise<UsageResult> {
  if (/[/\\]/.test(orgId)) {
    throw new Error('Invalid orgId: contains path traversal characters');
  }

  const url = `https://claude.ai/api/organizations/${orgId}/usage`;
  const res = await fetch(url, {
    headers: {
      'Cookie': `sessionKey=${sessionKey}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Usage API returned ${res.status}`);
  }

  const json = await res.json();
  const fiveHour = json?.five_hour;
  if (!fiveHour || typeof fiveHour.utilization !== 'number') {
    throw new Error('Unexpected usage API response format');
  }

  return {
    utilization: fiveHour.utilization,
    resetsAt: fiveHour.resets_at ? new Date(fiveHour.resets_at) : null,
  };
}
