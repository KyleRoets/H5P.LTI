// Quizzes+ for students: the course's published quizzes, grouped like ReachLMS's Quizzes page.
// Each quiz opens on its assignment page in ReachLMS (which applies the availability dates).
import { h, makeApi } from './util.js';
import { icon } from './icons.js';

const BOOT = window.BOOT;
const api = makeApi(() => BOOT.token);
const root = document.getElementById('quizzes');
const when = (d) => (d ? new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

async function load() {
  let r;
  try { r = await api.get('/api/quizzes'); } catch (e) { root.replaceChildren(h('div', { class: 'rs-empty' }, icon('alert', { size: 28 }), h('p', {}, e.message))); return; }
  const now = Date.now();
  const status = (q) => {
    if (q.unlock && Date.parse(q.unlock) > now) return { key: 'soon', text: `Not available until ${when(q.unlock)}` };
    if (q.lock && Date.parse(q.lock) < now) return { key: 'closed', text: `Closed ${when(q.lock)}` };
    if (q.used) return { key: 'done', text: q.score !== null && q.score !== undefined ? `Submitted · ${q.score} / ${q.points} pts` : 'Submitted' };
    return { key: 'open', text: q.lock ? `Available until ${when(q.lock)}` : 'Available' };
  };
  const item = (q) => {
    const s = status(q);
    const title = q.url ? h('a', { href: q.url, target: '_top', class: 'rq-item-title' }, q.title) : h('span', { class: 'rq-item-title' }, q.title);
    return h('div', { class: `rq-item student ${s.key}` },
      h('span', { class: 'rq-item-ico' }, icon('type-quiz', { size: 18 })),
      h('div', { class: 'rq-item-main' }, title,
        h('div', { class: 'rq-item-meta' }, h('span', { class: `rq-state ${s.key}` }, s.text),
          q.due && h('span', {}, h('strong', {}, 'Due'), ` ${when(q.due)}`), h('span', {}, `${q.points} pts`), h('span', {}, `${q.questions} Question${q.questions === 1 ? '' : 's'}`),
          q.attempts > 0 && h('span', {}, `${Math.max(0, q.attempts - q.used)} of ${q.attempts} attempt${q.attempts === 1 ? '' : 's'} left`))),
      q.url && s.key !== 'soon' && s.key !== 'closed' && h('a', { class: `btn sm ${s.key === 'open' ? 'primary' : ''}`, href: q.url, target: '_top' }, s.key === 'done' ? 'View' : 'Start', icon('chevron-right', { size: 14 })));
  };
  const groups = new Map();
  r.quizzes.forEach((q) => { if (!groups.has(q.group)) groups.set(q.group, []); groups.get(q.group).push(q); });
  root.replaceChildren(
    h('header', { class: 'rq-head' }, h('h1', {}, r.label), r.course && h('span', { class: 'rq-course' }, r.course)),
    ...(groups.size ? [...groups].map(([name, list]) => h('section', { class: 'rq-group-block' }, h('header', {}, h('span', {}, icon('chevron-down', { size: 16 }), name)), list.map(item)))
      : [h('div', { class: 'rs-empty' }, icon('type-quiz', { size: 30 }), h('p', {}, 'There are no quizzes in this course yet.'))]));
}
load();
window.addEventListener('pageshow', (e) => { if (e.persisted) load(); });

let lastH = 0;
new ResizeObserver(() => {
  const height = Math.ceil(document.documentElement.scrollHeight);
  if (Math.abs(height - lastH) < 4) return;
  lastH = height;
  window.parent?.postMessage({ subject: 'lti.frameResize', height }, '*');
}).observe(document.body);
