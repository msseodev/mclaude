import { ButtonInteraction } from 'discord.js';
import { MclaudeApiClient } from './api-client';

export async function handleButton(interaction: ButtonInteraction, apiClient: MclaudeApiClient): Promise<void> {
  await interaction.deferReply({ flags: 64 }); // ephemeral

  try {
    switch (interaction.customId) {
      case 'mclaude:pause':
        await apiClient.pauseRun();
        await interaction.editReply('Paused.');
        break;
      case 'mclaude:stop':
        await apiClient.stopRun();
        await interaction.editReply('Stopped.');
        break;
      case 'mclaude:run-again':
        await apiClient.startRun();
        await interaction.editReply('Queue started.');
        break;
      case 'mclaude:auto-pause':
        await apiClient.pauseAuto();
        await interaction.editReply('Auto mode paused.');
        break;
      case 'mclaude:auto-stop':
        await apiClient.stopAuto();
        await interaction.editReply('Auto mode stopped.');
        break;
      default:
        await interaction.editReply('Unknown action.');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await interaction.editReply(`Failed: ${message}`);
  }

  // Disable buttons on the original message to prevent double-click
  try {
    await interaction.message.edit({ components: [] });
  } catch { /* ignore if can't edit */ }
}
