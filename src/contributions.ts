import { Octokit } from '@octokit/rest';
import { ProviderError } from './discord.js';
import type { ContributionResult } from './types.js';

export type ContributionCheck = (username: string, repositories: string[]) => Promise<ContributionResult>;

export function contributionChecker(token: string, request: typeof fetch = fetch): ContributionCheck {
  const octokit = new Octokit({ auth: token, request: { timeout: 15_000, fetch: request }, log: {
    debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
  } });
  return async (username, repositories) => {
    const failed: string[] = [];
    const details: string[] = [];
    for (const repository of repositories) {
      const [owner, repo] = repository.split('/');
      try {
        const { data } = await octokit.repos.listCommits({
          owner, repo, author: username, per_page: 1,
        });
        if (data.length) return { hasContributed: true, contributedRepo: repository };
      } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : 'network error';
        failed.push(`${repository} (${status})`);
        const reason = error instanceof Error ? error.message.split('\n')[0].slice(0, 200) : 'unknown error';
        details.push(`${repository}: ${status}, ${reason}`);
      }
    }
    if (failed.length) throw new ProviderError(`Could not check GitHub repositories: ${failed.join(', ')}. Eligibility was not changed.`,
      `GitHub commit lookup: ${details.join('; ')}`);
    return { hasContributed: false, contributedRepo: null };
  };
}
