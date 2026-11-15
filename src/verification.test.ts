import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test, type TestContext } from 'node:test';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { contributionChecker, type ContributionCheck } from './contributions.js';
import { DiscordApi, ProviderError, ReauthorizationError } from './discord.js';
import { createPreviewApp } from './preview-app.js';
import { verify } from './verification.js';

const config = loadConfig({
  CLIENT_ID: 'test-client', CLIENT_SECRET: 'test-secret', DISCORD_TOKEN: 'test-bot', GITHUB_TOKEN: 'test-github',
  REPOSITORIES: 'owner/repo',
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function mockDiscord(overrides: Partial<{
  token: () => Response;
  connections: () => Response;
  role: (body: { platform_username: string; metadata: { contributed_to_repos: string } }) => Response;
}> = {}): DiscordApi {
  const request: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/oauth2/token')) return overrides.token?.() ?? json({ access_token: 'access', expires_in: 3600 });
    if (path.endsWith('/connections')) return overrides.connections?.() ??
      json([{ type: 'github', name: 'contributor', verified: true }]);
    if (path.endsWith('/role-connection')) return overrides.role?.(JSON.parse(String(init?.body))) ?? json({});
    throw new Error(`Unexpected mock request: ${path}`);
  };
  return new DiscordApi(config, request);
}

const contributed: ContributionCheck = async () => ({ hasContributed: true, contributedRepo: 'owner/repo' });

test('configuration defaults to the current Aspire repositories and rejects bad input', () => {
  assert.deepEqual(loadConfig({ CLIENT_ID: '1', CLIENT_SECRET: '2', DISCORD_TOKEN: '3', GITHUB_TOKEN: '4' }).repositories,
    ['microsoft/aspire', 'CommunityToolkit/Aspire', 'microsoft/aspire.dev', 'microsoft/aspire-samples']);
  assert.throws(() => loadConfig({}), /Missing required configuration/);
  assert.throws(() => loadConfig({
    CLIENT_ID: '1', CLIENT_SECRET: '2', DISCORD_TOKEN: '3', GITHUB_TOKEN: '4', REPOSITORIES: 'not-a-repository',
  }), /REPOSITORIES/);
});

test('verification sends Discord integer metadata as a string for both outcomes', async () => {
  for (const hasContributed of [true, false]) {
    const discord = mockDiscord({ role: body => {
      assert.equal(body.platform_username, 'contributor');
      assert.equal(body.metadata.contributed_to_repos, hasContributed ? '1' : '0');
      return json({});
    } });
    const result = await verify(discord, async () => ({ hasContributed, contributedRepo: hasContributed ? 'owner/repo' : null }),
      config.repositories, 'access');
    assert.equal(result.hasContributed, hasContributed);
  }
});

test('an unlinked GitHub account is not checked and does not change the role', async () => {
  const discord = mockDiscord({ connections: () => json([]), role: () => assert.fail('must not change role') });
  const result = await verify(discord, async () => assert.fail('must not check'), config.repositories, 'access');
  assert.equal(result.githubUsername, null);
});

test('provider failures and malformed responses never change the role', async () => {
  const discord = mockDiscord({ role: () => assert.fail('must not change role') });
  await assert.rejects(verify(discord, async () => { throw new ProviderError('GitHub unavailable'); }, config.repositories, 'access'),
    /GitHub unavailable/);
  await assert.rejects(verify(mockDiscord({ connections: () => json({ message: 'not an array' }) }), contributed,
    config.repositories, 'access'), /invalid connections response/);
  await assert.rejects(verify(mockDiscord({ connections: () => json({}, 401) }), contributed, config.repositories, 'access'),
    ReauthorizationError);
  await assert.rejects(mockDiscord({ token: () => json({ error: 'invalid_grant' }, 400) }).exchangeCode('code'), ReauthorizationError);
});

test('GitHub checker finds any past commit by the author in any repository', async () => {
  const urls: URL[] = [];
  const check = contributionChecker('test', async input => {
    const url = new URL(String(input));
    urls.push(url);
    return url.pathname.includes('/empty/') ? json([]) : json([{ sha: 'commit' }]);
  });
  assert.deepEqual(await check('contributor', ['empty/repo', 'owner/repo']), { hasContributed: true, contributedRepo: 'owner/repo' });
  assert.equal(urls.length, 2);
  assert.equal(urls[0].searchParams.get('author'), 'contributor');
  assert.equal(urls[0].searchParams.get('per_page'), '1');
  assert.equal(urls[0].searchParams.has('since'), false);
});

test('GitHub rate limits/permissions/network errors are not negative contribution results', async () => {
  for (const status of [403, 404, 429, 500]) {
    const check = contributionChecker('test', async () => json({ message: 'unavailable' }, status));
    await assert.rejects(check('user', ['owner/repo']), /Eligibility was not changed/);
  }
  const check = contributionChecker('test', async () => { throw new TypeError('network failure'); });
  await assert.rejects(check('user', ['owner/repo']), /Eligibility was not changed/);
});

async function listen(t: TestContext, app: ReturnType<typeof createApp>): Promise<string> {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

test('OAuth requires browser-bound, one-use state and completes a one-time verification', async t => {
  let tokenRequests = 0;
  let roleUpdates = 0;
  const discord = mockDiscord({
    token: () => { tokenRequests++; return json({ access_token: 'access' }); },
    role: () => { roleUpdates++; return json({}); },
  });
  const origin = await listen(t, createApp(config, discord, contributed));
  const home = await fetch(`${origin}/`);
  assert.match(await home.text(), /no matter when you made it/);
  assert.equal((await fetch(`${origin}/linked-role?code=bad`)).status, 400);
  assert.equal(tokenRequests, 0);
  const start = await fetch(`${origin}/auth`, { redirect: 'manual' });
  assert.equal(new URL(start.headers.get('location')!).origin, 'https://discord.com');
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  const cookie = start.headers.get('set-cookie')!.split(';')[0];
  const callback = `${origin}/linked-role?code=valid&state=${state}`;
  assert.equal((await fetch(callback)).status, 400);
  const completed = await fetch(callback, { headers: { Cookie: cookie } });
  assert.equal(completed.status, 200);
  assert.match(await completed.text(), /Success/);
  assert.equal(tokenRequests, 1);
  assert.equal(roleUpdates, 1);
  assert.equal((await fetch(callback, { headers: { Cookie: cookie } })).status, 400);
  assert.equal(tokenRequests, 1);
});

test('landing page explains verification and safely renders configured repository names', async t => {
  const origin = await listen(t, createApp({ ...config, repositories: ['owner/<script>alert(1)</script>'] },
    mockDiscord(), contributed));
  const response = await fetch(origin);
  const html = await response.text();
  assert.match(response.headers.get('content-type')!, /text\/html/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /href="\/auth">Verify with Discord/);
  assert.match(html, /<a href="https:\/\/support\.discord\.com\/[^"]+">Connect your GitHub account to Discord<\/a>/);
  assert.match(html, /default branch/);
  assert.match(html, /owner\/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<aside class="preview-notice"/);
  const copy = html.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<[^>]*>/g, ' ').trim();
  assert.ok(copy.split(/\s+/).length < 60, 'The landing page should stay brief');
  const icon = await fetch(`${origin}/aspire-icon.svg`);
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get('content-type')!, /image\/svg\+xml/);
  for (const weight of [400, 600]) {
    const font = await fetch(`${origin}/fonts/poppins-latin-${weight}-normal.woff2`);
    assert.equal(font.status, 200);
    assert.match(font.headers.get('content-type')!, /font\/woff2/);
  }
});

test('credential-free preview completes every outcome with browser-bound, one-use state', async t => {
  const origin = await listen(t, createPreviewApp());
  assert.match(await (await fetch(origin)).text(), /This preview won&#39;t change any real roles/);
  for (const [code, status, content] of [
    ['success', 200, /You're verified/],
    ['empty', 200, /No matching commits yet/],
    ['unlinked', 200, /Connect your GitHub account/],
    ['error', 502, /Simulated GitHub outage/],
  ] as const) {
    const start = await fetch(`${origin}/auth`, { redirect: 'manual' });
    const authorization = new URL(start.headers.get('location')!, origin);
    assert.equal(authorization.pathname, '/preview/authorize');
    assert.equal(authorization.origin, origin);
    const cookie = start.headers.get('set-cookie')!.split(';')[0];
    const choose = await fetch(authorization);
    assert.match(await choose.text(), /Preview result/);
    const callback = `${origin}/linked-role?${new URLSearchParams({ code, state: authorization.searchParams.get('state')! })}`;
    assert.equal((await fetch(callback)).status, 400);
    const result = await fetch(callback, { headers: { Cookie: cookie } });
    assert.equal(result.status, status);
    assert.match(await result.text(), content);
    assert.equal((await fetch(callback, { headers: { Cookie: cookie } })).status, 400);
  }
});
