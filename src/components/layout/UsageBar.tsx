'use client';

import { useState, useEffect } from 'react';

interface BucketData {
  utilization: number;
  resetsAt: string | null;
}

interface UsageData {
  configured: boolean;
  utilization?: number;
  resetsAt?: string | null;
  fiveHour?: BucketData | null;
  sevenDay?: BucketData | null;
  sevenDaySonnet?: BucketData | null;
  error?: string;
}

function barColor(pct: number) {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 75) return 'bg-orange-500';
  if (pct >= 50) return 'bg-yellow-500';
  return 'bg-green-500';
}

function textColor(pct: number) {
  if (pct >= 90) return 'text-red-600';
  if (pct >= 75) return 'text-orange-600';
  if (pct >= 50) return 'text-yellow-600';
  return 'text-green-600';
}

function formatReset(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function Bucket({ label, pct, resetsAt }: { label: string; pct: number; resetsAt?: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`font-medium ${textColor(pct)}`}>{label} {pct}%</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full rounded-full ${barColor(pct)} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {resetsAt && <span className="text-gray-400">{formatReset(resetsAt)}</span>}
    </div>
  );
}

export function UsageBar() {
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    const fetchUsage = () => {
      fetch('/api/usage')
        .then(res => res.json())
        .then(setUsage)
        .catch(() => setUsage(null));
    };
    fetchUsage();
    const interval = setInterval(fetchUsage, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!usage?.configured) return null;

  const hasBuckets = usage.fiveHour || usage.sevenDay || usage.sevenDaySonnet;

  return (
    <div className="flex h-8 items-center gap-4 border-t border-gray-200 bg-white px-4 text-xs">
      {hasBuckets ? (
        <>
          {usage.fiveHour && <Bucket label="5h" pct={usage.fiveHour.utilization} resetsAt={usage.fiveHour.resetsAt} />}
          {usage.sevenDay && <Bucket label="7d" pct={usage.sevenDay.utilization} resetsAt={usage.sevenDay.resetsAt} />}
          {usage.sevenDaySonnet && usage.sevenDaySonnet.utilization > 0 && (
            <Bucket label="Sonnet" pct={usage.sevenDaySonnet.utilization} resetsAt={usage.sevenDaySonnet.resetsAt} />
          )}
        </>
      ) : usage.utilization !== undefined ? (
        <Bucket label="Usage" pct={usage.utilization} resetsAt={usage.resetsAt} />
      ) : null}
    </div>
  );
}
