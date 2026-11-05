// Server-rendered HTML shells. The interactive UI is plain ES modules in /public/js.
import { config } from './config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const shell = (title, body, { scripts = '', bodyClass = '' } = {}) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="/img/icon.svg" type="image/svg+xml">
<link rel="icon" href="/img/icon-64.png" type="image/png" sizes="64x64">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preload" href="/fonts/alegreya-sans-800.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/app.css">
</head><body class="${bodyClass}">${body}${scripts}</body></html>`;

// The "ReachStudio by YouMultiply" lockup for server-rendered pages.
const brand = `<div class="logo logo-light logo-lg" role="img" aria-label="ReachStudio by YouMultiply"><img class="hand-mark" src="/img/hand.svg" alt="" height="64"><span class="logo-text"><span class="logo-word"><span class="logo-reach">Reach</span><span class="logo-studio">Studio</span></span><span class="logo-by">by YouMultiply</span></span></div>`;

export const views = {
  esc,

  studio(token) {
    return shell(config.toolName, '<div id="app" class="app"><div class="loading">Loading ReachStudio…</div></div>', {
      scripts: `<script>window.BOOT=${json({ token, toolName: config.toolName })}</script><script type="module" src="/js/studio.js"></script>`,
    });
  },

  player(token, content, opts = {}) {
    const boot = {
      token,
      content: { id: content.id, type: content.type, title: content.title, data: JSON.parse(content.data) },
      canEdit: !!opts.canEdit,
      graded: !!opts.graded,
      preview: !!opts.preview,
    };
    return shell(content.title, '<main id="player" class="player-root"></main>', {
      bodyClass: 'player-body',
      scripts: `<script>window.BOOT=${json(boot)}</script><script type="module" src="/js/player-page.js"></script>`,
    });
  },

  message(title, html) {
    return shell(title, `<div class="center-card">${brand}<h1>${esc(title)}</h1><p>${html}</p></div>`);
  },

  register(oc, rt, needsCode, error = '') {
    return shell(`Install ${config.toolName}`, `<div class="center-card">
      ${brand}
      <h1>Install ${esc(config.toolName)}</h1>
      <p>This adds an interactive-content button to the Rich Content Editor, plus graded activities for assignments and modules.</p>
      <ul class="checklist">
        <li>Rich Content Editor button (pages, quizzes, assignments, discussions)</li>
        <li>Assignment and module activities with automatic grading</li>
        <li>Optional course navigation link for teachers (disabled by default)</li>
      </ul>
      ${error ? `<p class="error">${esc(error)}</p>` : ''}
      <form method="post" action="/lti/register">
        <input type="hidden" name="openid_configuration" value="${esc(oc)}">
        <input type="hidden" name="registration_token" value="${esc(rt)}">
        ${needsCode ? '<label>Installation code<input name="code" required autocomplete="off"></label>' : ''}
        <button class="btn primary" type="submit">Install</button>
      </form></div>`);
  },

  registered(name, clientId) {
    return shell('Installed', `<div class="center-card">
      ${brand}
      <h1>${esc(config.toolName)} is registered</h1>
      <p>Registered with <strong>${esc(name)}</strong> (client ID <code>${esc(clientId)}</code>).</p>
      <p>Click <strong>Close</strong> below, then review and enable the tool in ReachLMS.</p>
      <button class="btn primary" onclick="(window.opener||window.parent).postMessage({subject:'org.imsglobal.lti.close'},'*')">Close</button>
      </div>`);
  },
};
