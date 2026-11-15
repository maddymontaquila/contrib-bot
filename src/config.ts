export interface Config {
  clientId: string;
  clientSecret: string;
  discordToken: string;
  githubClientId: string;
  githubClientSecret: string;
  redirectUri: string;
  repositories: string[];
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = ['CLIENT_ID', 'CLIENT_SECRET', 'DISCORD_TOKEN', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`);

  const repositories = (env.REPOSITORIES ?? 'microsoft/aspire,CommunityToolkit/Aspire,microsoft/aspire.dev,microsoft/aspire-samples')
    .split(',').map(repo => repo.trim()).filter(Boolean);
  if (!repositories.length || repositories.some(repo => !/^[\w.-]+\/[\w.-]+$/.test(repo))) {
    throw new Error('REPOSITORIES must be a comma-separated list of owner/repository names.');
  }
  const redirectUri = env.REDIRECT_URI ?? 'http://localhost:3000/linked-role';
  const url = new URL(redirectUri);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('REDIRECT_URI must be an HTTP(S) URL.');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');

  return {
    clientId: env.CLIENT_ID!.trim(),
    clientSecret: env.CLIENT_SECRET!.trim(),
    discordToken: env.DISCORD_TOKEN!.trim(),
    githubClientId: env.GITHUB_CLIENT_ID!.trim(),
    githubClientSecret: env.GITHUB_CLIENT_SECRET!.trim(),
    redirectUri,
    repositories,
    port,
  };
}
