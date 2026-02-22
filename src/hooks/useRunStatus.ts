'use client';

import { useEffect, useState, useCallback } from 'react';
import type { RunStatus } from '@/types';

export function useRunStatus() {
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/run/status');
      if (res.ok) {
        const data: RunStatus = await res.json();
        setStatus(data);
      }
    } catch {
      // ignore fetch errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { status, isLoading, refresh };
}
