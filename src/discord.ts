import type { Config } from './config.js';
import type { ContributionResult, DiscordConnection } from './types.js';

export class ProviderError extends Error {}
export class ReauthorizationError extends Error {
  constructor() {
    super('Discord authorization was rejected or expired. Start verification again.');
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class DiscordApi {
  constructor(private readonly config: Config, private readonly request: typeof fetch = fetch) {}

  private async send(path: string, init: RequestInit): Promise<Response> {
    return this.request(`https://discord.com/api/${path}`, { ...init, signal: AbortSignal.timeout(15_000) });
  }

  private async checked(path: string, init: RequestInit): Promise<Response> {
    const response = await this.send(path, init);
    if (response.status === 401) throw new ReauthorizationError();
    if (!response.ok) throw new ProviderError(`Discord request failed (HTTP ${response.status}).`);
    return response;
  }

  async exchangeCode(code: string): Promise<string> {
    const response = await this.send('oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'authorization_code', code, redirect_uri: this.config.redirectUri,
      }),
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      if (isObject(data) && data.error === 'invalid_grant') throw new ReauthorizationError();
      throw new ProviderError(`Discord token exchange failed (HTTP ${response.status}).`);
    }
    if (!isObject(data) || typeof data.access_token !== 'string' || !data.access_token) {
      throw new ProviderError('Discord returned an invalid token response.');
    }
    return data.access_token;
  }

  async githubConnection(accessToken: string): Promise<DiscordConnection | undefined> {
    const response = await this.checked('v10/users/@me/connections', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.every(item => isObject(item) &&
        typeof item.type === 'string' && typeof item.name === 'string' && typeof item.verified === 'boolean')) {
      throw new ProviderError('Discord returned an invalid connections response.');
    }
    return data.find((item: DiscordConnection) => item.type === 'github' && item.verified);
  }

  async updateRole(accessToken: string, username: string, result: ContributionResult): Promise<void> {
    await this.checked(`v10/users/@me/applications/${this.config.clientId}/role-connection`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform_name: 'Repository Contributor',
        platform_username: username,
        metadata: { contributed_to_repos: result.hasContributed ? '1' : '0' },
      }),
    });
  }

  async registerMetadata(): Promise<void> {
    const response = await this.send(`v10/applications/${this.config.clientId}/role-connections/metadata`, {
      method: 'PUT',
      headers: { Authorization: `Bot ${this.config.discordToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        key: 'contributed_to_repos',
        name: 'Repository Contributor',
        description: 'Has contributed to at least one configured repository',
        type: 7,
      }]),
    });
    if (!response.ok) throw new ProviderError(`Discord metadata registration failed (HTTP ${response.status}).`);
  }
}
