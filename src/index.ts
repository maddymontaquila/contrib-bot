import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { contributionChecker } from './contributions.js';
import { DiscordApi } from './discord.js';

try {
  const config = loadConfig();
  const discord = new DiscordApi(config);
  await discord.registerMetadata();
  const server = createApp(config, discord, contributionChecker(config.githubToken)).listen(config.port, '0.0.0.0', () => {
    console.log(`Contributor verification listening on port ${config.port}.`);
  });
  server.on('error', () => {
    console.error('HTTP server failed to start.');
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Application startup failed.');
  process.exitCode = 1;
}
