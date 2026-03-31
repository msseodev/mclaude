import { Client, TextChannel } from 'discord.js';
import { DiscordBotConfig } from './config';
import {
  buildPromptStartEmbed,
  buildPromptCompleteEmbed,
  buildPromptFailedEmbed,
  buildRateLimitEmbed,
  buildQueueCompleteEmbed,
  buildQueueStoppedEmbed,
  buildAuthExpiredEmbed,
  buildCycleStartEmbed,
  buildCycleCompleteEmbed,
  buildCycleFailedEmbed,
  buildAutoSessionCompleteEmbed,
  buildAutoSessionStoppedEmbed,
  buildCEORequestEmbed,
  buildRunActionRow,
  buildRateLimitActionRow,
  buildQueueCompleteActionRow,
  buildAutoActionRow,
} from './embeds';

// Verbose event types to skip for both run and auto modes
const SKIP_EVENT_TYPES = new Set([
  'text_delta',
  'tool_start',
  'tool_end',
  'rate_limit_wait',
  'agent_start',
  'agent_complete',
  'agent_failed',
  'phase_change',
  'finding_created',
  'finding_resolved',
  'finding_failed',
  'test_result',
  'git_checkpoint',
  'git_rollback',
  'designer_iteration',
  'review_iteration',
  'user_prompt_added',
]);

// Map Discord thread ID -> CEO request ID for thread-based replies
export const ceoRequestThreadMap = new Map<string, string>();

// AbortController per stream for clean shutdown
const abortControllers = new Map<string, AbortController>();

export function startSSEListeners(
  client: Client,
  config: DiscordBotConfig,
) {
  const channel = client.channels.cache.get(config.discordChannelId) as
    | TextChannel
    | undefined;

  if (channel) {
    connectStream('run', config, channel);
    connectStream('auto', config, channel);
    return;
  }

  console.error(
    `Channel ${config.discordChannelId} not in cache. Fetching...`,
  );
  client.channels
    .fetch(config.discordChannelId)
    .then((ch) => {
      if (ch?.isTextBased()) {
        connectStream('run', config, ch as TextChannel);
        connectStream('auto', config, ch as TextChannel);
      } else {
        console.error(
          `Channel ${config.discordChannelId} is not a text channel.`,
        );
      }
    })
    .catch((err) => {
      console.error('Failed to fetch Discord channel:', err);
    });
}

export function stopSSEListeners() {
  for (const controller of abortControllers.values()) {
    controller.abort();
  }
  abortControllers.clear();
}

async function connectStream(
  mode: 'run' | 'auto',
  config: DiscordBotConfig,
  channel: TextChannel,
  retryDelay = 1000,
) {
  // Abort any existing connection for this mode
  const existing = abortControllers.get(mode);
  if (existing) {
    existing.abort();
  }

  const controller = new AbortController();
  abortControllers.set(mode, controller);

  const streamPath = mode === 'run' ? '/api/run/stream' : '/api/auto/stream';
  const url = `${config.mlaudeBaseUrl}${streamPath}`;

  try {
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (config.mlaudeApiKey) {
      headers['Authorization'] = `Bearer ${config.mlaudeApiKey}`;
    }

    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`SSE connect failed: ${res.status}`);
    }

    console.log(`[${mode}] SSE connected to ${url}`);
    retryDelay = 1000; // reset backoff on successful connection

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let eventType = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr);
            // If no event: line was present, use the type field from the JSON data
            const resolvedType = eventType || data.type || '';
            await handleSSEEvent(mode, resolvedType, data, channel);
          } catch {
            // Skip JSON parse errors (e.g., partial data)
          }
          eventType = '';
        }
        // Heartbeat lines start with ':' - ignore them
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.log(`[${mode}] SSE connection aborted.`);
      return;
    }
    console.error(
      `[${mode}] SSE error:`,
      err instanceof Error ? err.message : err,
    );
  }

  // Reconnect with exponential backoff
  const nextDelay = Math.min(retryDelay * 2, 30000);
  console.log(`[${mode}] Reconnecting in ${retryDelay / 1000}s...`);
  setTimeout(
    () => connectStream(mode, config, channel, nextDelay),
    retryDelay,
  );
}

async function handleSSEEvent(
  mode: 'run' | 'auto',
  eventType: string,
  data: Record<string, unknown>,
  channel: TextChannel,
) {
  if (SKIP_EVENT_TYPES.has(eventType)) return;

  try {
    if (mode === 'run') {
      await handleRunEvent(eventType, data, channel);
    } else {
      await handleAutoEvent(eventType, data, channel);
    }
  } catch (err) {
    console.error(`[${mode}] Notification error for ${eventType}:`, err);
  }
}

async function handleRunEvent(
  eventType: string,
  data: Record<string, unknown>,
  channel: TextChannel,
) {
  // The SSE data format wraps event data in a `data` field:
  // { type: "prompt_start", data: { promptId, promptTitle, ... }, timestamp: "..." }
  const eventData = (data.data as Record<string, unknown>) || data;

  switch (eventType) {
    case 'prompt_start': {
      const embed = buildPromptStartEmbed({
        promptId: String(eventData.promptId || ''),
        promptTitle: String(eventData.promptTitle || 'Unknown'),
        executionId: String(eventData.executionId || ''),
        planName: (eventData.planName as string) || null,
        planCurrent: (eventData.planCurrent as number) || null,
        planTotal: (eventData.planTotal as number) || null,
      });
      const row = buildRunActionRow();
      await channel.send({ embeds: [embed], components: [row] });
      break;
    }

    case 'prompt_complete': {
      const embed = buildPromptCompleteEmbed({
        promptId: String(eventData.promptId || ''),
        promptTitle: String(eventData.promptTitle || 'Unknown'),
        executionId: String(eventData.executionId || ''),
        cost_usd: eventData.cost_usd as number | null,
        duration_ms: eventData.duration_ms as number | null,
        planName: (eventData.planName as string) || null,
        planCurrent: (eventData.planCurrent as number) || null,
        planTotal: (eventData.planTotal as number) || null,
      });
      await channel.send({ embeds: [embed] });
      break;
    }

    case 'prompt_failed': {
      const embed = buildPromptFailedEmbed({
        promptId: String(eventData.promptId || ''),
        promptTitle: String(eventData.promptTitle || 'Unknown'),
        executionId: String(eventData.executionId || ''),
        cost_usd: eventData.cost_usd as number | null,
        duration_ms: eventData.duration_ms as number | null,
        planName: (eventData.planName as string) || null,
        planCurrent: (eventData.planCurrent as number) || null,
        planTotal: (eventData.planTotal as number) || null,
      });
      const row = buildRunActionRow();
      await channel.send({ embeds: [embed], components: [row] });
      break;
    }

    case 'rate_limit': {
      const embed = buildRateLimitEmbed({
        message: String(eventData.message || 'Rate limited'),
        source: (eventData.source as string) || null,
        retryAfterMs: (eventData.retryAfterMs as number) ?? 0,
        waitingUntil: String(eventData.waitingUntil || new Date().toISOString()),
        retryCount: (eventData.retryCount as number) ?? 1,
      });
      const row = buildRateLimitActionRow();
      await channel.send({ embeds: [embed], components: [row] });
      break;
    }

    case 'queue_complete': {
      const embed = buildQueueCompleteEmbed({
        sessionId: String(eventData.sessionId || ''),
      });
      const row = buildQueueCompleteActionRow();
      await channel.send({ embeds: [embed], components: [row] });
      break;
    }

    case 'queue_stopped': {
      const embed = buildQueueStoppedEmbed({
        sessionId: String(eventData.sessionId || ''),
      });
      await channel.send({ embeds: [embed] });
      break;
    }

    case 'auth_expired': {
      const embed = buildAuthExpiredEmbed({
        sessionId: String(eventData.sessionId || ''),
        message: String(eventData.message || 'Authentication expired'),
      });
      await channel.send({ embeds: [embed] });
      break;
    }

    case 'session_status': {
      // Only notify on meaningful state changes, skip initial status
      // and running status (too noisy)
      break;
    }
  }
}

async function handleAutoEvent(
  eventType: string,
  data: Record<string, unknown>,
  channel: TextChannel,
) {
  const eventData = (data.data as Record<string, unknown>) || data;

  switch (eventType) {
    case 'cycle_start': {
      const embed = buildCycleStartEmbed({
        cycleId: String(eventData.cycleId || ''),
        cycleNumber: (eventData.cycleNumber as number) ?? 0,
        phase: String(eventData.phase || 'unknown'),
        findingId: (eventData.findingId as string) || null,
      });
      const row = buildAutoActionRow();
      await channel.send({ embeds: [embed], components: [row] });
      break;
    }

    case 'cycle_complete': {
      const embed = buildCycleCompleteEmbed({
        cycleId: String(eventData.cycleId || ''),
        cycleNumber: (eventData.cycleNumber as number) ?? 0,
        phase: String(eventData.phase || 'unknown'),
        cost_usd: eventData.cost_usd as number | null,
        duration_ms: eventData.duration_ms as number | null,
      });
      await channel.send({ embeds: [embed] });
      break;
    }

    case 'cycle_failed': {
      const embed = buildCycleFailedEmbed({
        cycleId: String(eventData.cycleId || ''),
        cycleNumber: (eventData.cycleNumber as number) ?? 0,
        phase: String(eventData.phase || 'unknown'),
        cost_usd: eventData.cost_usd as number | null,
        duration_ms: eventData.duration_ms as number | null,
      });
      const row = buildAutoActionRow();
      await channel.send({ embeds: [embed], components: [row] });
      break;
    }

    case 'rate_limit': {
      const embed = buildRateLimitEmbed({
        message: String(eventData.message || 'Rate limited'),
        source: (eventData.source as string) || null,
        retryAfterMs: (eventData.retryAfterMs as number) ?? 0,
        waitingUntil: String(eventData.waitingUntil || new Date().toISOString()),
        retryCount: (eventData.retryCount as number) ?? 1,
      });
      const row = buildRateLimitActionRow();
      await channel.send({ embeds: [embed], components: [row] });
      break;
    }

    case 'auth_expired': {
      const embed = buildAuthExpiredEmbed({
        sessionId: String(eventData.sessionId || ''),
        message: String(eventData.message || 'Authentication expired'),
      });
      await channel.send({ embeds: [embed] });
      break;
    }

    case 'session_status': {
      const status = String(eventData.status || '');
      if (status === 'completed') {
        const embed = buildAutoSessionCompleteEmbed({
          sessionId: String(eventData.sessionId || ''),
          reason: String(eventData.reason || 'unknown'),
        });
        await channel.send({ embeds: [embed] });
      } else if (status === 'stopped') {
        const embed = buildAutoSessionStoppedEmbed({
          sessionId: String(eventData.sessionId || ''),
        });
        await channel.send({ embeds: [embed] });
      }
      // Skip running/paused/pause_scheduled status updates (too noisy)
      break;
    }

    case 'ceo_request_created': {
      const request = (eventData.request as Record<string, unknown>) || eventData;
      const requestId = String(request.id || '');
      if (!requestId) {
        console.error('[notifications] CEO request event missing id, skipping');
        break;
      }
      const embed = buildCEORequestEmbed({
        id: requestId,
        title: String(request.title || 'Untitled Request'),
        description: String(request.description || ''),
        type: String(request.type || 'unknown'),
        from_agent: String(request.from_agent || 'unknown'),
        blocking: Boolean(request.blocking),
      });

      const message = await channel.send({ embeds: [embed] });
      const thread = await message.startThread({
        name: `CEO: ${String(request.title || 'Request').slice(0, 90)}`,
        autoArchiveDuration: 1440,
      });
      ceoRequestThreadMap.set(thread.id, requestId);
      await thread.send(
        '이 쓰레드에 답장하여 CEO 요청에 응답하세요.\n' +
        '- **승인** (approve): 첫 줄에 "승인" 또는 "approve"\n' +
        '- **거절** (reject): 첫 줄에 "거절" 또는 "reject"\n' +
        '- **답변** (answer): 그 외 모든 응답\n\n' +
        '첫 번째 응답만 반영됩니다.',
      );
      break;
    }
  }
}
