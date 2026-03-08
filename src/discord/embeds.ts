import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const COLORS = {
  running: 0x3B82F6,    // blue
  success: 0x22C55E,    // green
  error: 0xEF4444,      // red
  warning: 0xF59E0B,    // amber
  info: 0x6366F1,       // indigo
  stopped: 0x6B7280,    // gray
};

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

function formatCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return '-';
  return `$${usd.toFixed(4)}`;
}

function formatWaitDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '-';
  const minutes = Math.ceil(ms / 60000);
  return `${minutes}m`;
}

// ---------------------------------------------------------------------------
// Manual mode embeds
// ---------------------------------------------------------------------------

export function buildPromptStartEmbed(data: {
  promptId: string;
  promptTitle: string;
  executionId: string;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.running)
    .setTitle('Prompt Started')
    .setDescription(`**${data.promptTitle}**`)
    .addFields(
      { name: 'Prompt ID', value: data.promptId, inline: true },
      { name: 'Execution ID', value: data.executionId, inline: true },
    )
    .setTimestamp();
}

export function buildPromptCompleteEmbed(data: {
  promptId: string;
  promptTitle: string;
  executionId: string;
  cost_usd: number | null;
  duration_ms: number | null;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('Prompt Completed')
    .setDescription(`**${data.promptTitle}**`)
    .addFields(
      { name: 'Duration', value: formatDuration(data.duration_ms), inline: true },
      { name: 'Cost', value: formatCost(data.cost_usd), inline: true },
    )
    .setTimestamp();
}

export function buildPromptFailedEmbed(data: {
  promptId: string;
  promptTitle: string;
  executionId: string;
  cost_usd: number | null;
  duration_ms: number | null;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle('Prompt Failed')
    .setDescription(`**${data.promptTitle}**`)
    .addFields(
      { name: 'Duration', value: formatDuration(data.duration_ms), inline: true },
      { name: 'Cost', value: formatCost(data.cost_usd), inline: true },
    )
    .setTimestamp();
}

export function buildRateLimitEmbed(data: {
  message: string | null;
  source: string | null;
  retryAfterMs: number;
  waitingUntil: string;
  retryCount: number;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle('Rate Limited')
    .setDescription(data.message || 'Rate limit hit, waiting to retry.')
    .addFields(
      { name: 'Retry In', value: formatWaitDuration(data.retryAfterMs), inline: true },
      { name: 'Attempt', value: `#${data.retryCount}`, inline: true },
      { name: 'Resume At', value: `<t:${Math.floor(new Date(data.waitingUntil).getTime() / 1000)}:T>`, inline: true },
    )
    .setTimestamp();
}

export function buildQueueCompleteEmbed(data: {
  sessionId: string;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('Queue Complete')
    .setDescription('All prompts in the queue have been executed.')
    .addFields(
      { name: 'Session', value: data.sessionId, inline: true },
    )
    .setTimestamp();
}

export function buildQueueStoppedEmbed(data: {
  sessionId: string;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.stopped)
    .setTitle('Queue Stopped')
    .setDescription('The queue has been stopped.')
    .addFields(
      { name: 'Session', value: data.sessionId, inline: true },
    )
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Auto mode embeds
// ---------------------------------------------------------------------------

export function buildCycleStartEmbed(data: {
  cycleId: string;
  cycleNumber: number;
  phase: string;
  findingId: string | null;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.running)
    .setTitle(`Cycle #${data.cycleNumber} Started`)
    .addFields(
      { name: 'Phase', value: data.phase, inline: true },
    )
    .setTimestamp();

  if (data.findingId) {
    embed.addFields({ name: 'Finding', value: data.findingId, inline: true });
  }

  return embed;
}

export function buildCycleCompleteEmbed(data: {
  cycleId: string;
  cycleNumber: number;
  phase: string;
  cost_usd: number | null;
  duration_ms: number | null;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(`Cycle #${data.cycleNumber} Completed`)
    .addFields(
      { name: 'Phase', value: data.phase, inline: true },
      { name: 'Duration', value: formatDuration(data.duration_ms), inline: true },
      { name: 'Cost', value: formatCost(data.cost_usd), inline: true },
    )
    .setTimestamp();
}

export function buildCycleFailedEmbed(data: {
  cycleId: string;
  cycleNumber: number;
  phase: string;
  cost_usd: number | null;
  duration_ms: number | null;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle(`Cycle #${data.cycleNumber} Failed`)
    .addFields(
      { name: 'Phase', value: data.phase, inline: true },
      { name: 'Duration', value: formatDuration(data.duration_ms), inline: true },
      { name: 'Cost', value: formatCost(data.cost_usd), inline: true },
    )
    .setTimestamp();
}

export function buildAutoSessionCompleteEmbed(data: {
  sessionId: string;
  reason: string;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('Auto Session Complete')
    .setDescription(`Autonomous mode has finished.`)
    .addFields(
      { name: 'Reason', value: data.reason, inline: true },
      { name: 'Session', value: data.sessionId, inline: true },
    )
    .setTimestamp();
}

export function buildAutoSessionStoppedEmbed(data: {
  sessionId: string;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.stopped)
    .setTitle('Auto Session Stopped')
    .setDescription('Autonomous mode has been stopped.')
    .addFields(
      { name: 'Session', value: data.sessionId, inline: true },
    )
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Button action rows
// ---------------------------------------------------------------------------

export function buildRunActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('mclaude:pause')
      .setLabel('Pause')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mclaude:stop')
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger),
  );
}

export function buildRateLimitActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('mclaude:stop')
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger),
  );
}

export function buildQueueCompleteActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('mclaude:run-again')
      .setLabel('Run Again')
      .setStyle(ButtonStyle.Primary),
  );
}

export function buildAutoActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('mclaude:auto-pause')
      .setLabel('Pause')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('mclaude:auto-stop')
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger),
  );
}
