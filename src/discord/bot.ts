import { Client, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config';
import { MclaudeApiClient } from './api-client';
import { registerCommands, handleCommand } from './commands';
import { handleButton } from './buttons';
import { startSSEListeners, stopSSEListeners } from './notifications';

async function main() {
  const config = loadConfig();
  const apiClient = new MclaudeApiClient(config.mclaudeBaseUrl, config.mclaudeApiKey);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once('ready', async () => {
    console.log(`Discord bot logged in as ${client.user!.tag}`);
    await registerCommands(client, config);
    startSSEListeners(client, config);
  });

  client.on('interactionCreate', async (interaction) => {
    // Owner check: only the configured owner can use the bot
    if (interaction.user.id !== config.discordOwnerId) {
      if (interaction.isRepliable()) {
        await interaction.reply({ content: 'Unauthorized.', flags: 64 }); // ephemeral
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction, apiClient);
    } else if (interaction.isButton()) {
      await handleButton(interaction, apiClient);
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('Shutting down Discord bot...');
    stopSSEListeners();
    client.destroy();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await client.login(config.discordBotToken);
}

main().catch((err) => {
  console.error('Bot failed to start:', err);
  process.exit(1);
});
