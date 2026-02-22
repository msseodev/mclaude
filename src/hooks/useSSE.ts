'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { SSEEvent } from '@/types';

export function useSSE(url: string, onEvent: (event: SSEEvent) => void) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let es: EventSource | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;

      es = new EventSource(url);

      es.onopen = () => {
        if (!disposed) setConnected(true);
      };

      es.onmessage = (event) => {
        if (disposed) return;
        try {
          const parsed: SSEEvent = JSON.parse(event.data);
          onEventRef.current(parsed);
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        if (disposed) return;
        setConnected(false);
        es?.close();
        reconnectTimerRef.current = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      disposed = true;
      es?.close();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [url]);

  return { connected };
}
