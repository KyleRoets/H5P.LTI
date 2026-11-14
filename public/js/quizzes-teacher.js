// Quizzes+ for teachers: a page of its own inside the course (no ReachStudio app around it).
// It grows with its content and tells ReachLMS its height, like a normal course page.
import { h, makeApi, iconBtn } from './util.js';
import { icon } from './icons.js';
import { responsesTable, snapshotFrame, fmtWhen } from './submission.js';
import { initRq } from './rq/teacher.js';

const BOOT = window.BOOT;
const api = makeApi(() => BOOT.token);
const app = document.getElementById('rqt');
app.replaceChildren();

function moreMenu(name, items) {
  const menu = h('div', { class: 'menu hidden', role: 'menu' }, items.map(([ic, label, fn, cls]) =>
    h('button', { type: 'button', role: 'menuitem', class: cls || '', onclick: () => { menu.classList.add('hidden'); fn(); } }, icon(ic, { size: 15 }), h('span', {}, label))));
  const btn = iconBtn('more', `More actions for ${name}`, (e) => {
    e.stopPropagation();
    document.querySelectorAll('.menu:not(.hidden)').forEach((m) => m !== menu && m.classList.add('hidden'));
    menu.classList.toggle('hidden');
  });
  btn.setAttribute('aria-haspopup', 'menu');
  return h('span', { class: 'menu-wrap' }, btn, menu);
}
document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) document.querySelectorAll('.menu:not(.hidden)').forEach((m) => m.classList.add('hidden')); });

const topbar = () => document.createComment('');
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
const rq = initRq({ app, api, topbar, go, moreMenu, responsesTable, snapshotFrame, fmtWhen });

function route() {
  const [view, arg] = location.hash.replace(/^#/, '').split('/');
  if (view === 'rq' && arg) return rq.renderQuizEdit(arg);
  return rq.renderQuizzes();
}
window.addEventListener('hashchange', route);
route();

// Tell ReachLMS how tall the page is, so the course frame fits it (no inner scrollbars).
let lastH = 0;
new ResizeObserver(() => {
  const height = Math.max(600, Math.ceil(document.documentElement.scrollHeight));
  if (Math.abs(height - lastH) < 4) return;
  lastH = height;
  window.parent?.postMessage({ subject: 'lti.frameResize', height }, '*');
}).observe(document.body);
