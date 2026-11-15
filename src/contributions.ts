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
      }
    }
    if (failed.length) throw new ProviderError(`Could not check GitHub repositories: ${failed.join(', ')}. Eligibility was not changed.`);
    return { hasContributed: false, contributedRepo: null };
  };
}
