import { runManager } from '@/lib/run-manager';
import type { SSEEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  let removeListener: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial status
      const status = runManager.getStatus();
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'session_status', data: status, timestamp: new Date().toISOString() })}\n\n`
        )
      );

      // Subscribe to events
      removeListener = runManager.addListener((event: SSEEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          removeListener?.();
        }
      });

      // Heartbeat every 30s to keep connection alive
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          removeListener?.();
        }
      }, 30000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      removeListener?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
