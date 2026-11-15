import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { DiscordApi, ProviderError } from './discord.js';
import { page } from './pages.js';

export function createPreviewApp(port = 3000) {
  const config = loadConfig({
    CLIENT_ID: 'preview-client', CLIENT_SECRET: 'preview-secret',
    DISCORD_TOKEN: 'preview-bot', GITHUB_TOKEN: 'preview-github',
    PORT: String(port),
  });
  const outcomes = ['success', 'empty', 'unlinked', 'error'];
  const discord = new DiscordApi(config, async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/oauth2/token')) {
      const code = new URLSearchParams(String(init?.body)).get('code');
      if (!code || !outcomes.includes(code)) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ access_token: code });
    }
    if (path.endsWith('/connections')) {
      const outcome = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '');
      return Response.json(outcome === 'unlinked' ? [] : [{ type: 'github', name: `preview-${outcome}`, verified: true }]);
    }
    if (path.endsWith('/role-connection')) return Response.json({});
    throw new Error(`Unexpected preview request: ${path}`);
  });
  const app = createApp(config, discord, async username => {
    if (username === 'preview-error') throw new ProviderError('Simulated GitHub outage. Please retry later.');
    const hasContributed = username === 'preview-success';
    return { hasContributed, contributedRepo: hasContributed ? config.repositories[0] : null };
  }, true);
  app.get('/preview/authorize', (req, res) => {
    if (typeof req.query.state !== 'string') return res.status(400).send('Start the preview from the landing page.');
    const state = req.query.state;
    res.set('Cache-Control', 'no-store');
    const labels = ['Matching contribution', 'No matching commits', 'GitHub not connected', 'Provider unavailable'];
    res.send(page('Preview result', `<section class="result">
      <h1>Choose a result</h1>
      <div class="result-actions">${outcomes.map((outcome, index) =>
        `<a class="button" href="/linked-role?${new URLSearchParams({ code: outcome, state })}">${labels[index]}</a>`).join('')}</div>
      <p class="hint"><a href="/">Back</a></p>
    </section>`, true));
  });
  return app;
}
