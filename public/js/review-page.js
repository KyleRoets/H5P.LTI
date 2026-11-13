// A submitted attempt, as SpeedGrader shows it to the lecturer (also used for a student's own
// submission details). Read-only: the activity exactly as the student handed it in.
import { h, makeApi } from './util.js';
import { icon } from './icons.js';
import { TYPES } from './types/index.js';
import { snapshotFrame, fmtWhen, responsesTable } from './submission.js';

const BOOT = window.BOOT;
const api = makeApi(() => BOOT.token);
const root = document.getElementById('review');

async function show(id) {
  let r;
  try { r = await api.get(`/api/submissions/${encodeURIComponent(id)}`); } catch (e) {
    root.replaceChildren(h('div', { class: 'rs-empty' }, icon('alert', { size: 28 }), h('p', {}, e.message))); return;
  }
  const s = r.submission;
  const t = TYPES[r.content?.type] || { name: 'Activity', icon: 'help', color: '#888' };
  const switcher = r.attempts.length > 1 && h('label', { class: 'attempt-switch' }, 'Attempt ',
    h('select', { onchange: (e) => show(e.target.value) }, r.attempts.map((a) => h('option', { value: a.id, selected: a.id === s.id }, `${a.attempt} — ${fmtWhen(a.at)}${a.mode === 'auto' ? ` (${a.score}/${a.max})` : ''}`))));
  const pending = (s.responses || []).filter((r) => /grade in SpeedGrader/.test(r.note || ''));
  const grade = pending.length && s.mode !== 'manual'
    ? h('div', { class: 'review-grade manual' }, icon('edit', { size: 18 }), h('div', {}, h('strong', {}, `${s.score} / ${s.max} so far`), h('span', {}, `Marked automatically except ${pending.length} question${pending.length === 1 ? '' : 's'} for you to grade (below). Add those points to the score in SpeedGrader.`)))
    : s.mode === 'manual'
    ? h('div', { class: 'review-grade manual' }, icon('edit', { size: 18 }), h('div', {}, h('strong', {}, 'Needs grading'), h('span', {}, `Enter a grade out of ${s.max} in SpeedGrader.`)))
    : h('div', { class: 'review-grade auto' }, icon('check', { size: 18 }), h('div', {}, h('strong', {}, `${s.score} / ${s.max}`), h('span', {}, s.sent !== null && s.sent !== s.score ? `Marked automatically. Best attempt (${s.sent}) is in the gradebook.` : 'Marked automatically and sent to the gradebook.')));
  root.replaceChildren(...[
    h('header', { class: 'review-head' },
      h('div', { class: 'review-title' }, h('span', { class: 'ticon', style: { background: t.color } }, icon(t.icon, { size: 16 })),
        h('div', {}, h('h1', {}, r.content?.title || 'Activity'), h('p', {}, `${s.name || 'Student'} · attempt ${s.attempt}${r.attempts.length > 1 ? ` (${r.attempts.length} submitted)` : ''} · submitted ${fmtWhen(s.at)}`))),
      switcher),
    grade,
    s.passback === 'failed' && h('p', { class: 'warn' }, icon('alert', { size: 16 }), h('span', {}, 'This attempt was saved in ReachStudio, but sending it to ReachLMS failed.')),
    responsesTable(s.responses),
    h('div', { class: 'review-work' }, h('h4', { class: 'review-sub' }, 'The activity as submitted'), snapshotFrame(s.snapshot, BOOT.build))].filter(Boolean));
}

// The session knows which submission was launched; start there.
api.get('/api/review').then((r) => show(r.id)).catch((e) => root.replaceChildren(h('p', { class: 'rs-status' }, e.message)));

let lastH = 0;
new ResizeObserver(() => {
  const height = Math.ceil(document.documentElement.scrollHeight);
  if (Math.abs(height - lastH) < 4) return;
  lastH = height;
  window.parent?.postMessage({ subject: 'lti.frameResize', height }, '*');
}).observe(document.body);
