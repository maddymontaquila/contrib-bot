import type { ContributionCheck } from './contributions.js';
import type { DiscordApi } from './discord.js';
import type { ContributionResult } from './types.js';

export interface VerificationResult extends ContributionResult {
  githubUsername: string | null;
}

export async function verify(
  discord: DiscordApi, checkContributions: ContributionCheck, repositories: string[], accessToken: string,
): Promise<VerificationResult> {
  const github = await discord.githubConnection(accessToken);
  if (!github) return { githubUsername: null, hasContributed: false, contributedRepo: null };
  const result = await checkContributions(github.name, repositories);
  await discord.updateRole(accessToken, github.name, result);
  return { githubUsername: github.name, ...result };
}
