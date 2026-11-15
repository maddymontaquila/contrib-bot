export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function page(title: string, content: string, preview = false): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Verify your Aspire contributions for a Discord linked role.">
  <title>${escapeHtml(title)} - Aspire contributors</title>
  <style>
    @font-face { font-family: Poppins; font-style: normal; font-weight: 400; font-display: swap; src: url("/fonts/poppins-latin-400-normal.woff2") format("woff2"); }
    @font-face { font-family: Poppins; font-style: normal; font-weight: 600; font-display: swap; src: url("/fonts/poppins-latin-600-normal.woff2") format("woff2"); }
    :root { color-scheme: light; --ink: #1f1e33; --accent: #7455dd; --accent-hover: #512bd4; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100svh; display: grid; place-items: center; background: #fff; color: var(--ink); font-family: Poppins, "Segoe UI", sans-serif; font-size: 16px; line-height: 1.6; }
    a { color: var(--accent-hover); text-underline-offset: 4px; }
    a:hover { color: var(--ink); }
    a:focus-visible, summary:focus-visible { outline: 3px solid var(--accent-hover); outline-offset: 5px; }
    .skip-link { position: absolute; left: 20px; top: -80px; }
    .skip-link:focus { top: 16px; background: #fff; padding: 8px 12px; }
    .shell { width: min(488px, 100%); padding: 48px 24px; }
    .brand { display: inline-flex; align-items: center; gap: 12px; color: var(--ink); text-decoration: none; font-size: 26px; font-weight: 600; }
    .brand img { display: block; }
    main { margin: 32px 0; }
    h1 { margin: 0 0 12px; font-size: clamp(26px, 6vw, 32px); line-height: 1.25; font-weight: 600; text-wrap: balance; }
    p { margin: 0 0 24px; }
    .button { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 12px 20px; border-radius: 6px; background: var(--accent); color: #fff; font-weight: 600; text-decoration: none; }
    .button:hover, .button:active { color: #fff; background: var(--accent-hover); }
    .hint, footer, .preview-notice { font-size: 13px; }
    .hint { margin: 16px 0 0; }
    .preview-notice { margin-top: 20px; }
    details { margin-top: 24px; font-size: 13px; }
    summary { cursor: pointer; min-height: 44px; }
    details p { margin-bottom: 12px; }
    .repo-list { margin: 0; padding-left: 20px; }
    .repo-list li { overflow-wrap: anywhere; }
    .result-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 20px; margin-top: 24px; }
    .result-actions a:not(.button) { display: inline-flex; align-items: center; min-height: 44px; }
    @media (max-width: 400px) { .button { width: 100%; } }
  </style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="shell">
    <header><a class="brand" href="/"><img src="/aspire-icon.svg" alt="" width="32" height="32">Aspire</a></header>
    ${preview ? '<aside class="preview-notice" aria-label="Local preview">This preview won&#39;t change any real roles.</aside>' : ''}
    <main id="main">${content}</main>
    <footer>Verification is a one-time check, and the app doesn't store your data.</footer>
  </div>
</body>
</html>`;
}

export function landingPage(repositories: string[], preview = false): string {
  return page('Verify', `
    <h1>Aspire contributors</h1>
    <p><a href="https://support.discord.com/hc/en-us/articles/32330173689623-Account-Connections-on-Discord-FAQ#h_01JVZBVNC1HYWX4BTPFN9B4B1V">Connect your GitHub account to Discord</a>, then check whether your contributions qualify for the contributor role.</p>
    <a class="button" href="/auth">Verify with Discord</a>
    <details>
      <summary>Eligible repositories</summary>
      <p>A commit you authored on a listed repository's default branch counts, no matter when you made it.</p>
      <ul class="repo-list">${repositories.map(repo => `<li>${escapeHtml(repo)}</li>`).join('')}</ul>
    </details>`, preview);
}
