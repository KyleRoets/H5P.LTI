// Renders one piece of content inside ReachLMS (embedded iframe, module item or assignment).
// As an assignment, students hand in attempts with Submit: each becomes a submission in
// SpeedGrader (marked automatically or by the lecturer). Lecturers see their students' results.
import { h, makeApi, toast, modal } from './util.js';
import { icon } from './icons.js';
import { renderContent } from './types/index.js';
import { takeSnapshot, snapshotFrame, fmtWhen, responsesTable } from './submission.js';

const BOOT = window.BOOT;
const api = makeApi(() => BOOT.token);
const root = document.getElementById('player');
root.replaceChildren(); // remove the loading indicator
const G = BOOT.grading; // set when this launch is an assignment
const pts = (n) => `${n} point${n === 1 ? '' : 's'}`;
document.body.style.background = BOOT.content.data.style?.bg || '';

async function editInStudio() {
  try {
    const { token } = await api.post('/api/session/handoff');
    // Same frame: the lecturer never leaves ReachLMS. "Back to the activity" returns here.
    location.assign(`/studio?t=${encodeURIComponent(token)}&back=1#edit/${BOOT.content.id}`);
  } catch (e) { toast(e.message, 'error'); }
}
const editBtn = () => BOOT.canEdit && h('button', { class: 'btn sm', type: 'button', title: 'You own this content', onclick: editInStudio }, icon('edit', { size: 14 }), h('span', {}, 'Edit in ReachStudio'));

// ---------------- page embeds and module items (not graded) ----------------
function plainPlayer() {
  const status = h('span', { class: 'rs-status' });
  const report = async (score, max) => {
    if (BOOT.preview || !max) return;
    try { await api.post('/api/score', { score, max }); } catch { /* statistics only */ }
  };
  root.append(...[BOOT.canEdit && h('div', { class: 'rs-toolbar' }, status, editBtn()), renderContent(BOOT.content.type, BOOT.content.data, { report })].filter(Boolean));
}

// ---------------- assignment: student ----------------
async function studentAssignment() {
  document.body.classList.add('rs-assignment');
  if (!G.showAnswers) document.body.classList.add('rs-no-reveal');
  // Lecturer chose to hide marking: activities still mark answers (for the score and SpeedGrader)
  // but students don't see right/wrong — they answer, move on and submit.
  const hideMarks = G.mode === 'auto' && !G.showFeedback;
  if (hideMarks) document.body.classList.add('rs-hide-feedback', 'rs-no-reveal');
  const bar = h('div', { class: 'assign-bar' });
  const stage = h('div', { class: 'assign-stage' });
  root.append(bar, stage);
  let info;
  try { info = await api.get('/api/assignment'); } catch (e) { bar.replaceChildren(h('p', { class: 'rs-status' }, e.message)); return; }

  let latest = null; // { score, max } from the activity's own Check
  let contentEl = null;
  let records = new Map(); // question-by-question answers for the lecturer
  const outOf = () => (G.mode === 'auto' ? `Marked automatically · ${pts(G.max)}` : `Graded by your lecturer · ${pts(G.max)}`);
  const attemptsText = () => (G.attempts ? `Attempt ${Math.min(info.used + 1, G.attempts)} of ${G.attempts}` : (info.used ? `Attempt ${info.used + 1}` : 'Unlimited attempts'));
  const countedText = () => (G.showScore && info.counted !== null && info.counted !== undefined ? `Score in the gradebook: ${info.counted} / ${G.max}` : '');

  const submitBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => submit() }, icon('send', { size: 15 }), h('span', {}, 'Submit'));
  const hint = h('span', { class: 'assign-hint' });
  const drawBar = (mode) => {
    bar.replaceChildren(...[
      h('div', { class: 'assign-meta' }, h('span', { class: 'assign-tag' }, icon('award', { size: 14 }), 'Assignment'), h('span', {}, outOf()), mode === 'working' && h('span', {}, attemptsText()), countedText() && h('span', { class: 'assign-counted' }, countedText())),
      mode === 'working' && h('div', { class: 'assign-actions' }, hint, submitBtn)].filter(Boolean));
    if (mode === 'working') {
      submitBtn.disabled = false;
      hint.textContent = G.mode === 'manual'
        ? 'When you have finished, press Submit to hand in your work.'
        : hideMarks ? (latest ? 'All done? Press Submit to hand in your answers.' : 'Answer the questions, then press Submit.')
          : latest ? `Your score: ${latest.score} / ${latest.max}. Press Submit to hand it in.` : 'Complete the activity and press Check, then Submit.';
    }
  };

  const startAttempt = () => {
    latest = null;
    records = new Map();
    contentEl = renderContent(BOOT.content.type, BOOT.content.data, {
      grading: G,
      report: (score, max) => { latest = { score, max }; drawBar('working'); },
      record: (r) => { if (r?.key) records.set(String(r.key), r); },
    });
    stage.replaceChildren(contentEl);
    drawBar('working');
  };

  // After handing in (or when no attempts are left): the work as submitted, read-only.
  const showSubmitted = async (sub, justNow) => {
    drawBar('done');
    const left = G.attempts ? G.attempts - info.used : Infinity;
    const status = sub.mode === 'manual'
      ? h('p', {}, icon('clock', { size: 16 }), h('span', {}, `Submitted ${justNow ? 'just now' : fmtWhen(sub.at)} — your lecturer will grade it in ReachLMS.`))
      : !G.showScore || sub.score === null || sub.score === undefined
        ? h('p', {}, icon('check', { size: 16 }), h('span', {}, `Submitted ${justNow ? 'just now' : fmtWhen(sub.at)} — your answers have been marked and sent to your lecturer.`))
        : h('p', {}, icon('check', { size: 16 }), h('span', {}, `Submitted ${justNow ? 'just now' : fmtWhen(sub.at)} — you scored ${sub.score} / ${sub.max}.${sub.sent !== null && sub.sent !== undefined && sub.sent !== sub.score ? ` Your best score (${sub.sent}) counts.` : ''}`));
    const failed = sub.passback === 'failed' && h('p', { class: 'warn' }, icon('alert', { size: 16 }), h('span', {}, 'Your work was saved, but ReachLMS could not be updated. Please tell your lecturer.'));
    const again = left > 0 && h('button', { class: 'btn primary', type: 'button', onclick: startAttempt }, icon('restore', { size: 15 }), h('span', {}, G.attempts ? `Start attempt ${info.used + 1} of ${G.attempts}` : 'Start a new attempt'));
    const card = h('div', { class: 'assign-done' }, status, failed, h('p', { class: 'muted' }, left === Infinity ? '' : left > 0 ? `${left} attempt${left === 1 ? '' : 's'} left.` : 'You have used all your attempts.'), again);
    stage.replaceChildren(card, h('div', { class: 'assign-snap' }, h('h4', {}, 'Your submitted work'), h('div', { class: 'loading-sm' }, 'Loading…')));
    try {
      const full = await api.get(`/api/submissions/${sub.id}`);
      stage.querySelector('.assign-snap').replaceChildren(...[h('h4', {}, `Your submitted work — attempt ${full.submission.attempt}`),
        responsesTable(full.submission.responses, { marks: !hideMarks }),
        // With marking hidden, a step-by-step activity's final screen says nothing useful: the answer list is enough.
        !(hideMarks && full.submission.responses?.length) && snapshotFrame(full.submission.snapshot, BOOT.build, { hideMarks })].filter(Boolean));
    } catch { stage.querySelector('.assign-snap')?.remove(); }
  };

  async function submit() {
    const last = G.attempts && info.used + 1 >= G.attempts;
    const what = G.mode !== 'auto' ? 'Your lecturer will see exactly what you did and grade it.'
      : hideMarks ? (latest ? 'Your answers will be marked and sent to your lecturer.' : 'You haven\'t finished yet — unanswered questions score 0.')
      : latest ? `Your score of ${latest.score} / ${latest.max} will be sent to the gradebook.`
        : 'You haven\'t pressed Check yet, so this attempt will score 0.';
    const ok = await modal({
      title: 'Submit your work?',
      body: `${what}${last ? ' This is your last attempt.' : ''}`,
      confirm: 'Submit',
    });
    if (!ok) return;
    submitBtn.disabled = true;
    try {
      const r = await api.post('/api/score', { score: G.mode === 'auto' ? (latest?.score ?? 0) : null, snapshot: takeSnapshot(contentEl), responses: [...records.values()] });
      info = r;
      toast(r.passback === 'failed' ? 'Saved, but ReachLMS could not be updated' : 'Submitted', r.passback === 'failed' ? 'error' : undefined);
      if (hideMarks) document.querySelectorAll('.modal-back').forEach((m) => m.remove());
      showSubmitted({ id: r.id, mode: r.mode, score: r.score, sent: r.sent, max: r.max, passback: r.passback }, true);
    } catch (e) { toast(e.message, 'error'); submitBtn.disabled = false; }
  }

  if (G.attempts && info.used >= G.attempts && info.last) showSubmitted(info.last, false);
  else startAttempt();
}

// ---------------- assignment: lecturer ----------------
function teacherAssignment() {
  const resultsBtn = h('button', { class: 'btn sm primary', type: 'button', onclick: showResults }, icon('users', { size: 14 }), h('span', {}, 'Student submissions'));
  root.append(
    h('div', { class: 'assign-bar teacher' },
      h('div', { class: 'assign-meta' }, h('span', { class: 'assign-tag' }, icon('award', { size: 14 }), 'Assignment · lecturer view'),
        h('span', {}, G.mode === 'auto' ? `Marked automatically · ${pts(G.max)}` : `You grade it in SpeedGrader · ${pts(G.max)}`),
        h('span', {}, G.attempts ? `${G.attempts} attempt${G.attempts === 1 ? '' : 's'}` : 'Unlimited attempts')),
      h('div', { class: 'assign-actions' }, editBtn(), resultsBtn)),
    h('p', { class: 'assign-note' }, icon('info', { size: 14 }), h('span', {}, 'Students see a Submit button here. Each submission appears in SpeedGrader with a view of their work. You can try the activity below — nothing you do is recorded.')),
    renderContent(BOOT.content.type, BOOT.content.data, { grading: G }));
}

async function showResults() {
  let r;
  try { r = await api.get('/api/results'); } catch (e) { toast(e.message, 'error'); return; }
  const body = r.students.length
    ? h('table', { class: 'results' },
      h('thead', {}, h('tr', {}, ['Student', 'Attempts', 'Latest', 'Submitted', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, r.students.map((s) => {
        const last = s.attempts.at(-1);
        return h('tr', {},
          h('td', {}, s.name),
          h('td', { class: 'num' }, String(s.attempts.length)),
          h('td', {}, last.mode === 'manual' ? h('span', { class: 'pill pending' }, 'Needs grading in SpeedGrader') : `${last.score} / ${last.max}${last.sent !== last.score ? ` (best ${last.sent})` : ''}`),
          h('td', {}, fmtWhen(last.at)),
          h('td', {}, h('button', { class: 'btn sm', type: 'button', onclick: () => viewSubmission(last.id) }, icon('eye', { size: 14 }), h('span', {}, 'View'))));
      })))
    : h('p', { class: 'help' }, 'No submissions yet. When students press Submit, they appear here and in SpeedGrader.');
  await modal({ title: 'Student submissions', body: h('div', { class: 'results-wrap' }, body), confirm: null, cancel: 'Close', wide: true });
}

async function viewSubmission(id) {
  let r;
  try { r = await api.get(`/api/submissions/${id}`); } catch (e) { toast(e.message, 'error'); return; }
  document.querySelectorAll('.modal-back').forEach((m) => m.remove());
  const s = r.submission;
  await modal({
    title: `${s.name || 'Student'} — attempt ${s.attempt}`,
    body: h('div', { class: 'sub-view' },
      h('p', { class: 'sub-line' }, s.mode === 'manual' ? 'Graded by the lecturer in SpeedGrader.' : `Score ${s.score} / ${s.max}`, ' · ', fmtWhen(s.at)),
      responsesTable(s.responses) || '',
      snapshotFrame(s.snapshot, BOOT.build)),
    confirm: null, cancel: 'Close', wide: true,
  });
}

// Opened from the ReachQuizzes list in this frame: a way back to the list.
if (BOOT.back) root.append(h('button', { class: 'btn sm ghost rq-back', type: 'button', onclick: () => location.assign(BOOT.back) }, icon('arrow-left', { size: 14 }), h('span', {}, 'All quizzes')));
if (G && BOOT.teacher) teacherAssignment();
else if (G && BOOT.graded && !BOOT.preview) studentAssignment();
else plainPlayer();

// Tell ReachLMS (Canvas) how tall the content is so the iframe fits without scrollbars.
let lastH = 0;
const sendHeight = () => {
  const height = Math.ceil(document.documentElement.scrollHeight);
  if (Math.abs(height - lastH) < 4) return;
  lastH = height;
  window.parent?.postMessage({ subject: 'lti.frameResize', height }, '*');
};
new ResizeObserver(sendHeight).observe(document.body);
window.addEventListener('load', sendHeight);
