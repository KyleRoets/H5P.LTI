// ReachQuizzes for students: the course's published quizzes, opened in this frame.
import { h, makeApi, toast } from './util.js';
import { icon } from './icons.js';
import { TYPES } from './types/index.js';

const BOOT = window.BOOT;
const api = makeApi(() => BOOT.token);
const root = document.getElementById('quizzes');
const when = (d) => (d ? new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

async function load() {
  let r;
  try { r = await api.get('/api/quizzes'); } catch (e) { root.replaceChildren(h('div', { class: 'rs-empty' }, icon('alert', { size: 28 }), h('p', {}, e.message))); return; }
  const now = Date.now();
  const state = (q) => {
    if (q.start && Date.parse(q.start) > now) return { key: 'soon', label: `Opens ${when(q.start)}`, open: false };
    if (q.end && Date.parse(q.end) < now) return { key: 'closed', label: `Closed ${when(q.end)}`, open: false };
    if (q.attempts && q.used >= q.attempts) return { key: 'done', label: 'Submitted', open: true, action: 'View' };
    if (q.used) return { key: 'done', label: 'Submitted', open: true, action: q.attempts ? `Try again (${q.attempts - q.used} left)` : 'Try again' };
    return { key: 'open', label: q.end ? `Due ${when(q.end)}` : 'Open', open: true, action: 'Start' };
  };
  const card = (q) => {
    const t = TYPES[q.type] || { icon: 'type-quiz', color: '#888', name: 'Quiz' };
    const s = state(q);
    return h('article', { class: `rq-card ${s.key}` },
      h('span', { class: 'ticon', style: { background: t.color } }, icon(t.icon, { size: 18 })),
      h('div', { class: 'rq-main' },
        h('h3', {}, q.title),
        h('p', { class: 'rq-meta' }, `${q.points} pts · ${q.attempts ? `${q.attempts} attempt${q.attempts === 1 ? '' : 's'}` : 'unlimited attempts'}${q.mode === 'manual' ? ' · graded by your teacher' : ''}`),
        h('p', { class: `rq-state ${s.key}` }, s.label, q.used > 0 && q.score !== null && q.score !== undefined ? ` · score ${q.score} / ${q.points}` : '', q.used > 0 && q.lastAt ? ` · last submitted ${when(`${q.lastAt.replace(' ', 'T')}Z`)}` : '')),
      s.open && h('button', { class: `btn ${s.key === 'open' ? 'primary' : ''}`, type: 'button', onclick: async () => {
        try { const { url } = await api.post(`/api/quizzes/${q.id}/open`); location.assign(url); } catch (e) { toast(e.message, 'error'); }
      } }, h('span', {}, s.action), icon('chevron-right', { size: 15 })));
  };
  const groups = [['Open', r.quizzes.filter((q) => ['open'].includes(state(q).key))], ['Submitted', r.quizzes.filter((q) => state(q).key === 'done')], ['Upcoming', r.quizzes.filter((q) => state(q).key === 'soon')], ['Closed', r.quizzes.filter((q) => state(q).key === 'closed')]].filter(([, l]) => l.length);
  root.replaceChildren(
    h('header', { class: 'rq-head' }, h('h1', {}, r.label), r.course && h('span', { class: 'rq-course' }, r.course)),
    ...(groups.length ? groups.map(([name, list]) => h('section', { class: 'rq-group' }, h('h2', {}, name), list.map(card)))
      : [h('div', { class: 'rs-empty' }, icon('type-quiz', { size: 30 }), h('p', {}, 'There are no quizzes in this course yet.'))]));
}
load();
// Coming back from a quiz (browser history) shows the page from cache: refresh the status.
window.addEventListener('pageshow', (e) => { if (e.persisted) load(); });

let lastH = 0;
new ResizeObserver(() => {
  const height = Math.ceil(document.documentElement.scrollHeight);
  if (Math.abs(height - lastH) < 4) return;
  lastH = height;
  window.parent?.postMessage({ subject: 'lti.frameResize', height }, '*');
}).observe(document.body);
