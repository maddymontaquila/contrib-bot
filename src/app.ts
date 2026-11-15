import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Config } from './config.js';
import type { ContributionCheck } from './contributions.js';
import { DiscordApi, ProviderError, ReauthorizationError } from './discord.js';
import { escapeHtml, landingPage, page } from './pages.js';
import { verify } from './verification.js';

export function createApp(config: Config, discord: DiscordApi, checkContributions: ContributionCheck, preview = false) {
  const app = express();
  const render = (title: string, content: string) => page(title, `<section class="result">${content}</section>`, preview);
  const retry = '<div class="result-actions"><a class="button" href="/auth">Try again</a><a href="/">Back</a></div>';
  const pendingStates = new Map<string, number>();
  const cookieOptions = {
    httpOnly: true, sameSite: 'lax' as const, secure: new URL(config.redirectUri).protocol === 'https:', path: '/linked-role',
  };
  app.disable('x-powered-by');
  app.get('/aspire-icon.svg', (_req, res) => res.sendFile(fileURLToPath(new URL('../aspire-icon.svg', import.meta.url))));
  app.use('/fonts', express.static(fileURLToPath(new URL('../node_modules/@fontsource/poppins/files/', import.meta.url))));
  app.get('/', (_req, res) => {
    res.send(landingPage(config.repositories, preview));
  });
  app.get('/auth', (_req, res) => {
    for (const [state, expires] of pendingStates) if (expires <= Date.now()) pendingStates.delete(state);
    if (pendingStates.size >= 5000) return res.status(503).send(render('Please try later',
      '<h1>Please try later.</h1><p>Too many checks are in progress.</p><a href="/">Back</a>'));
    const state = randomBytes(32).toString('hex');
    pendingStates.set(state, Date.now() + 10 * 60 * 1000);
    res.cookie('oauth_state', state, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
    const params = new URLSearchParams({
      client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code',
      scope: 'role_connections.write identify connections', state,
    });
    res.redirect(`${preview ? '/preview/authorize' : 'https://discord.com/oauth2/authorize'}?${params}`);
  });
  app.get('/linked-role', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { code, state } = req.query;
    const cookie = req.headers.cookie?.split(';').map(part => part.trim())
      .find(part => part.startsWith('oauth_state='))?.slice('oauth_state='.length);
    if (typeof state !== 'string' || state !== cookie || (pendingStates.get(state) ?? 0) <= Date.now()) {
      return res.status(400).send(render('Authorization expired',
        `<h1>Start again.</h1><p>This authorization expired or was already used.</p>${retry}`));
    }
    pendingStates.delete(state);
    res.clearCookie('oauth_state', cookieOptions);
    if (typeof code !== 'string' || !code) return res.status(400).send(render('Authorization incomplete',
      `<h1>Authorization incomplete.</h1><p>Authorize with Discord to continue.</p>${retry}`));
    try {
      const accessToken = await discord.exchangeCode(code);
      const result = await verify(discord, checkContributions, config.repositories, accessToken);
      if (!result.githubUsername) {
        return res.send(render('Connect GitHub', `<h1>Connect your GitHub account.</h1>
          <p>Discord Settings &gt; Connections &gt; GitHub.</p>${retry}`));
      }
      res.send(result.hasContributed
        ? render('Success', `<h1>You're verified.</h1><p>Contribution found:
            <strong>${escapeHtml(result.githubUsername)}</strong> in <strong>${escapeHtml(result.contributedRepo!)}</strong>.</p>
            <p>Return to Discord and select your server's contributor linked role.</p><a href="/">Done</a>`)
        : render('No Contributions', `<h1>No matching commits yet.</h1>
            <p>Check the GitHub account connected in Discord, or try after contributing.</p>${retry}`));
    } catch (error) {
      // 503 rather than 502: DigitalOcean replaces 502 bodies with a generic page, hiding the retry message.
      const status = error instanceof ReauthorizationError ? 401 : error instanceof ProviderError ? 503 : 500;
      const detail = error instanceof ProviderError ? error.detail ?? error.message
        : error instanceof ReauthorizationError ? 'Discord rejected the authorization (invalid_grant or 401)'
        : error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : 'unknown error';
      console.error(`Verification failed (${status}). ${detail}`);
      const message = status === 500 ? 'Verification failed. Please retry later.'
        : error instanceof Error ? error.message : 'Verification failed.';
      res.status(status).send(render('Verification unavailable',
        `<h1>Check unavailable.</h1><p>${escapeHtml(message)}</p>${retry}`));
    }
  });
  return app;
}
