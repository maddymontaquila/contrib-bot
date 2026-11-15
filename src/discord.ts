import type { Config } from './config.js';
import type { ContributionResult, DiscordConnection } from './types.js';

export class ProviderError extends Error {
  /** Credential-free detail for server logs, e.g. the provider's error code. */
  constructor(message: string, readonly detail?: string) {
    super(message);
  }
}
export class ReauthorizationError extends Error {
  constructor() {
    super('Discord authorization was rejected or expired. Start verification again.');
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Discord error bodies contain only error codes and short descriptions, never request credentials.
function describe(step: string, response: Response, body: unknown): string {
  const parts = [`${step}: HTTP ${response.status}`];
  if (isObject(body)) {
    for (const key of ['error', 'error_description', 'code', 'message']) {
      if (typeof body[key] === 'string' || typeof body[key] === 'number') parts.push(`${key}=${String(body[key]).slice(0, 200)}`);
    }
  } else if (typeof body === 'string' && /error code: 1015|cloudflare/i.test(body)) {
    parts.push('blocked or rate limited by Cloudflare');
  }
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) parts.push(`retry-after=${retryAfter}`);
  return parts.join(', ');
}

export class DiscordApi {
  constructor(private readonly config: Config, private readonly request: typeof fetch = fetch) {}

  private async send(path: string, init: RequestInit): Promise<Response> {
    return this.request(`https://discord.com/api/${path}`, { ...init, signal: AbortSignal.timeout(15_000) });
  }

  private async checked(step: string, path: string, init: RequestInit): Promise<Response> {
    const response = await this.send(path, init);
    if (response.status === 401) throw new ReauthorizationError();
    if (!response.ok) {
      throw new ProviderError(`Discord request failed (HTTP ${response.status}).`, describe(step, response, await readJson(response)));
    }
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
    const data = await readJson(response);
    if (!response.ok) {
      if (isObject(data) && data.error === 'invalid_grant') throw new ReauthorizationError();
      throw new ProviderError(`Discord token exchange failed (HTTP ${response.status}).`,
        describe('Discord token exchange', response, data));
    }
    if (!isObject(data) || typeof data.access_token !== 'string' || !data.access_token) {
      throw new ProviderError('Discord returned an invalid token response.', 'Discord token exchange: response had no access_token');
    }
    return data.access_token;
  }

  async githubConnection(accessToken: string): Promise<DiscordConnection | undefined> {
    const response = await this.checked('Discord connections lookup', 'v10/users/@me/connections', {
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
    await this.checked('Discord role-connection update', `v10/users/@me/applications/${this.config.clientId}/role-connection`, {
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
    if (!response.ok) {
      const detail = describe('Discord metadata registration', response, await readJson(response));
      throw new ProviderError(`${detail}.`, detail);
    }
  }
}
