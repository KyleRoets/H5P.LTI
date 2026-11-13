// Server-rendered HTML shells. The interactive UI is plain ES modules in /public/js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { isSecure, secureData } from './secure.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// Every app module, so the browser fetches them all at once instead of discovering imports one
// level at a time (a long chain of round trips on a slow connection).
const JS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'js');
const MODULES = (function list(dir, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(path.join(dir, e.name), `${rel}${e.name}/`) : e.name.endsWith('.js') ? [`${rel}${e.name}`] : []));
}(JS_DIR)).filter((f) => !/^(reset-page|quizzes-page|review-page|player-page|studio)\.js$/.test(f));
const preloads = () => MODULES.map((f) => `<link rel="modulepreload" href="/js/v/${config.build}/${f}">`).join('');

// Shown the instant the page arrives (inline styles, no downloads), until the app replaces it.
// The real ReachLMS hand mark, read from the front-end brand file so there is one source.
const HAND_PATH = fs.readFileSync(path.join(JS_DIR, 'brand.js'), 'utf8').match(/HAND_PATH = '([^']+)'/)?.[1] || '';
const HAND = `<svg viewBox="198 70 604 856" width="34" height="48" aria-hidden="true"><path fill="#278DDF" fill-rule="evenodd" d="${HAND_PATH}"/></svg>`;
export const splash = (label, { compact = false } = {}) => (compact
  ? '<div class="boot-splash compact" role="status" aria-label="Loading"><span></span><span></span><span></span></div>'
  : `<div class="boot-splash" role="status">${HAND}<p>${esc(label)}</p><i></i></div>`);
const SPLASH_CSS = `<style>
.boot-splash{min-height:70vh;display:grid;place-content:center;justify-items:center;gap:10px;font:600 15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#5D6779;animation:bs-in .25s ease-out}
.boot-splash svg{animation:bs-pulse 1.2s ease-in-out infinite}.boot-splash p{margin:0}
.boot-splash i{display:block;width:120px;height:4px;border-radius:4px;background:linear-gradient(90deg,#E6F2FC 25%,#278DDF 50%,#E6F2FC 75%) 0 0/200% 100%;animation:bs-bar 1s linear infinite}
.boot-splash.compact{min-height:120px;display:flex;align-items:center;justify-content:center;gap:6px}
.boot-splash.compact span{width:8px;height:8px;border-radius:50%;background:#278DDF;opacity:.35;animation:bs-dot 1s ease-in-out infinite}
.boot-splash.compact span:nth-child(2){animation-delay:.15s}.boot-splash.compact span:nth-child(3){animation-delay:.3s}
@keyframes bs-pulse{50%{transform:scale(.92);opacity:.7}}@keyframes bs-bar{to{background-position:-200% 0}}@keyframes bs-dot{50%{opacity:1;transform:translateY(-3px)}}@keyframes bs-in{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.boot-splash *{animation:none!important}}
</style>`;

const shell = (title, body, { scripts = '', bodyClass = '', modules = false } = {}) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="/img/icon.svg" type="image/svg+xml">
<link rel="icon" href="/img/icon-64.png" type="image/png" sizes="64x64">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
${SPLASH_CSS}
<link rel="preload" href="/fonts/alegreya-sans-800.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/v/${config.build}/app.css">
${modules ? preloads() : ''}
</head><body class="${bodyClass}">${body}${scripts}</body></html>`;

// The "ReachStudio by YouMultiply" lockup for server-rendered pages.
const brand = `<div class="logo logo-light logo-lg" role="img" aria-label="ReachStudio by YouMultiply"><img class="hand-mark" src="/img/hand.svg" alt="" height="64"><span class="logo-text"><span class="logo-word"><span class="logo-reach">Reach</span><span class="logo-studio">Studio</span></span><span class="logo-by">by YouMultiply</span></span></div>`;

export const views = {
  esc,

  studio(token) {
    return shell(config.toolName, `<div id="app" class="app">${splash('Opening ReachStudio…')}</div>`, {
      modules: true,
      scripts: `<script>window.BOOT=${json({ token, toolName: config.toolName, build: config.build })}</script><script type="module" src="/js/v/${config.build}/studio.js"></script>`,
    });
  },

  player(token, content, opts = {}) {
    const boot = {
      token,
      // Students in exam mode never receive the answer key (see secure.js).
      content: { id: content.id, type: content.type, title: content.title,
        data: opts.graded && !opts.teacher && isSecure(content.type, opts.grading) ? secureData(JSON.parse(content.data)) : JSON.parse(content.data) },
      secure: !!(opts.graded && !opts.teacher && isSecure(content.type, opts.grading)),
      canEdit: !!opts.canEdit,
      graded: !!opts.graded,
      teacher: !!opts.teacher,
      back: typeof opts.back === 'string' ? opts.back : '',
      build: config.build,
      grading: opts.grading || null,
      preview: !!opts.preview,
    };
    return shell(content.title, `<main id="player" class="player-root">${splash('', { compact: true })}</main>`, {
      modules: true,
      bodyClass: 'player-body',
      scripts: `<script>window.BOOT=${json(boot)}</script><script type="module" src="/js/v/${config.build}/player-page.js"></script>`,
    });
  },

  // A submitted attempt, opened from SpeedGrader (or from the student's submission details).
  review(token) {
    return shell('Submission', `<main id="review" class="review-root">${splash('Opening the submission…')}</main>`, {
      modules: true,
      bodyClass: 'player-body review-body',
      scripts: `<script>window.BOOT=${json({ token, build: config.build })}</script><script type="module" src="/js/v/${config.build}/review-page.js"></script>`,
    });
  },

  // ReachQuizzes for students: the course's published quizzes.
  quizzes(token) {
    return shell(config.quizToolName, `<main id="quizzes" class="quizzes-root">${splash('Opening quizzes…')}</main>`, {
      modules: true,
      bodyClass: 'player-body',
      scripts: `<script>window.BOOT=${json({ token, build: config.build, label: config.quizNavLabel })}</script><script type="module" src="/js/v/${config.build}/quizzes-page.js"></script>`,
    });
  },

  message(title, html) {
    // The logo already names the tool, so the home page skips a repeated heading.
    const heading = title === config.toolName ? '' : `<h1>${esc(title)}</h1>`;
    return shell(title, `<div class="center-card">${brand}${heading}<p>${html}</p></div>`);
  },

  register(oc, rt, needsCode, error = '', app = 'studio') {
    const quizzes = app === 'quizzes';
    const name = quizzes ? config.quizToolName : config.toolName;
    return shell(`Install ${name}`, `<div class="center-card">
      ${brand}
      <h1>Install ${esc(name)}</h1>
      ${quizzes ? `<p>This adds a <strong>${esc(config.quizNavLabel)}</strong> item to the course menu: quizzes built with ReachStudio activities, each one a graded assignment with SpeedGrader.</p>
      <ul class="checklist">
        <li>Course menu item for teachers and students, off until a teacher switches it on (Settings → Navigation)</li>
        <li>Publishing a quiz creates its assignment and gradebook column</li>
        <li>Uses the same accounts and content library as ReachStudio — install ReachStudio too</li>
      </ul>` : `<p>This adds an interactive-content button to the Rich Content Editor, plus graded activities for assignments and modules.</p>
      <ul class="checklist">
        <li>Rich Content Editor button (pages, quizzes, assignments, discussions)</li>
        <li>Assignment and module activities with automatic grading</li>
        <li>Optional course navigation link for teachers (disabled by default)</li>
      </ul>`}
      ${error ? `<p class="error">${esc(error)}</p>` : ''}
      <form method="post" action="/lti/register">
        <input type="hidden" name="openid_configuration" value="${esc(oc)}">
        <input type="hidden" name="registration_token" value="${esc(rt)}">
        <input type="hidden" name="app" value="${quizzes ? 'quizzes' : 'studio'}">
        ${needsCode ? '<label>Installation code<input name="code" required autocomplete="off"></label>' : ''}
        <button class="btn primary" type="submit">Install</button>
      </form></div>`);
  },

  reset() {
    return shell(`Reset your ${config.toolName} password`, `<div class="center-card reset-card">${brand}
      <h1>Choose a new password</h1>
      <p class="help">This link works once and expires 1 hour after it was created.</p>
      <form id="reset-form" novalidate>
        <label>New password<input type="password" name="password" autocomplete="new-password" required minlength="8"></label>
        <label>Confirm new password<input type="password" name="confirm" autocomplete="new-password" required minlength="8"></label>
        <p class="error hidden" role="alert"></p>
        <button class="btn primary block" type="submit">Save new password</button>
      </form>
      <div class="done hidden"><p><strong>Your password has been changed.</strong></p><p>You can now sign in with your new password — or simply open ReachStudio from ReachLMS and sign in once.</p><a class="btn primary" href="/studio">Go to ReachStudio</a></div>
      </div>`, { scripts: `<script type="module" src="/js/v/${config.build}/reset-page.js"></script>` });
  },

  registered(name, clientId, app = 'studio') {
    return shell('Installed', `<div class="center-card">
      ${brand}
      <h1>${esc(app === 'quizzes' ? config.quizToolName : config.toolName)} is registered</h1>
      <p>Registered with <strong>${esc(name)}</strong> (client ID <code>${esc(clientId)}</code>).</p>
      <p>Click <strong>Close</strong> below, then review and enable the tool in ReachLMS.</p>
      <button class="btn primary" onclick="(window.opener||window.parent).postMessage({subject:'org.imsglobal.lti.close'},'*')">Close</button>
      </div>`);
  },
};
