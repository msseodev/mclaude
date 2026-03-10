'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ChatStatus } from '@/lib/types';

export function useChatStatus() {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/status');
      if (res.ok) {
        setStatus(await res.json());
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
