// Snapshots of a learner's finished activity: captured when they submit, shown to the lecturer in
// SpeedGrader and in the assignment's results list. Shown only in a sandboxed frame (no scripts).
import { h } from './util.js';
import { icon } from './icons.js';

/** The activity as it looks now, with typed answers and choices baked into the HTML. */
export function takeSnapshot(el) {
  const copy = el.cloneNode(true);
  const src = el.querySelectorAll('input, textarea, select');
  const dst = copy.querySelectorAll('input, textarea, select');
  src.forEach((s, i) => {
    const d = dst[i]; if (!d) return;
    if (s.tagName === 'TEXTAREA') d.textContent = s.value;
    else if (s.tagName === 'SELECT') [...d.options].forEach((o, j) => { if (s.options[j]?.selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
    else if (s.type === 'checkbox' || s.type === 'radio') { if (s.checked) d.setAttribute('checked', ''); else d.removeAttribute('checked'); }
    else d.setAttribute('value', s.value);
    d.setAttribute('disabled', '');
  });
  copy.querySelectorAll('video, audio').forEach((m) => { m.removeAttribute('autoplay'); m.setAttribute('preload', 'none'); });
  copy.querySelectorAll('.rs-drag-layer, .toast').forEach((n) => n.remove());
  return copy.outerHTML;
}

/**
 * Question-by-question record (quizzes, slides, video questions, summaries, arithmetic, branching
 * paths, book chapters): what the student answered and what was right. Null when there is none.
 */
export function responsesTable(list, { marks = true } = {}) {
  if (!Array.isArray(list) || !list.length) return null;
  const mark = (ok) => (ok === true ? h('span', { class: 'resp-ok' }, icon('check', { size: 14, stroke: 3 }), 'Correct')
    : ok === false ? h('span', { class: 'resp-no' }, icon('x', { size: 14, stroke: 3 }), 'Incorrect') : h('span', { class: 'resp-na' }, '—'));
  const showCorrect = marks && list.some((r) => r.correct);
  const right = list.filter((r) => r.ok === true).length; const marked = list.filter((r) => r.ok === true || r.ok === false).length;
  return h('div', { class: 'responses' },
    h('h4', {}, marks ? 'Answers' : 'Your answers', marks && marked ? h('span', { class: 'resp-sum' }, ` ${right} of ${marked} correct`) : ''),
    h('table', {},
      h('thead', {}, h('tr', {}, ['#', 'Question', marks ? 'Student answer' : 'Answer', showCorrect && 'Correct answer', marks && 'Result'].filter(Boolean).map((x) => h('th', {}, x)))),
      h('tbody', {}, list.map((r, i) => h('tr', { class: !marks ? '' : r.ok === false ? 'is-wrong' : r.ok === true ? 'is-right' : '' },
        h('td', { class: 'num' }, String(i + 1)), h('td', {}, r.question || ''), h('td', {}, r.answer ?? ''),
        showCorrect && h('td', {}, r.correct || ''), marks && h('td', {}, mark(r.ok), r.note ? h('small', {}, ` ${r.note}`) : ''))))));
}

/** Read-only view of a snapshot that grows to fit its content. hideMarks: hide right/wrong (student view). */
export function snapshotFrame(html, build, { hideMarks = false } = {}) {
  const frame = h('iframe', { class: 'snapshot-frame', title: 'Submitted work', sandbox: 'allow-same-origin', loading: 'lazy' });
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/app.css?v=${encodeURIComponent(build || '')}">
<style>html,body{margin:0;background:transparent}body{padding:14px}.rs-actions .btn:not(.hidden){pointer-events:none}</style></head>
<body class="player-body snapshot-body rs-assignment rs-no-reveal${hideMarks ? ' rs-hide-feedback' : ''}">${html || '<p class="rs-status">No snapshot was saved for this attempt.</p>'}</body></html>`;
  const fit = () => {
    try {
      const d = frame.contentDocument; if (!d?.body) return;
      frame.style.height = `${Math.max(120, Math.ceil(d.documentElement.scrollHeight))}px`;
    } catch { /* not ready */ }
  };
  frame.addEventListener('load', () => {
    fit();
    try { frame.contentDocument.querySelectorAll('img').forEach((img) => img.addEventListener('load', fit)); } catch { /* ignore */ }
    setTimeout(fit, 300); setTimeout(fit, 1200);
  });
  return frame;
}

export const fmtWhen = (s) => (s ? new Date(`${String(s).replace(' ', 'T')}Z`).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
