import { h, textField, selectField, checkField, mediaField, listEditor, optionsEditor, choiceQuestion, feedback, formatText, shuffle } from '../util.js';

const newQ = (kind = 'choice') => (kind === 'truefalse'
  ? { kind, text: '', image: '', options: [{ text: 'True', correct: true }, { text: 'False', correct: false }], feedbackCorrect: '', feedbackWrong: '' }
  : { kind, text: '', image: '', options: [{ text: '', correct: true }, { text: '', correct: false }, { text: '', correct: false }], feedbackCorrect: '', feedbackWrong: '' });

export default {
  id: 'quiz',
  name: 'Quiz (Question Set)',
  description: 'A sequence of multiple choice and true/false questions with a final score.',
  icon: '✅',
  color: '#2f9e44',
  graded: true,
  defaults: () => ({ intro: '', passPercent: 70, shuffleQuestions: false, shuffleOptions: true, questions: [newQ()] }),

  editor(data, ctx) {
    return h('div', {},
      textField('Introduction (optional)', data, 'intro', ctx.onChange, { multiline: true, rows: 2 }),
      h('div', { class: 'field-row' },
        textField('Pass mark (%)', data, 'passPercent', ctx.onChange, { type: 'number' }),
        h('div', {}, checkField('Shuffle question order', data, 'shuffleQuestions', ctx.onChange), checkField('Shuffle answers', data, 'shuffleOptions', ctx.onChange))),
      listEditor({
        items: data.questions, label: 'Questions', addText: 'Question', min: 1, onChange: ctx.onChange, startCollapsed: data.questions.length > 3,
        itemLabel: (q, i) => `${i + 1}. ${q.kind === 'truefalse' ? '[T/F] ' : ''}${q.text || 'Untitled question'}`,
        create: () => newQ(),
        renderItem: (q, i, changed) => {
          const optHost = h('div');
          const drawOpts = () => optHost.replaceChildren(optionsEditor(q, changed, { multi: q.kind !== 'truefalse', fixed: q.kind === 'truefalse' }));
          drawOpts();
          return h('div', {},
            selectField('Question type', q, 'kind', [['choice', 'Multiple choice'], ['truefalse', 'True / False']], changed, {
              after: () => { if (q.kind === 'truefalse') q.options = newQ('truefalse').options; else if (q.options.length < 2) q.options = newQ().options; changed(); drawOpts(); },
            }),
            textField('Question', q, 'text', changed, { multiline: true, rows: 2 }),
            mediaField('Image (optional)', q, 'image', changed, ctx),
            optHost,
            h('p', { class: 'help' }, 'Tick more than one answer to make it a "select all that apply" question.'),
            h('div', { class: 'field-row' },
              textField('Feedback if correct', q, 'feedbackCorrect', changed),
              textField('Feedback if wrong', q, 'feedbackWrong', changed)));
        },
      }));
  },

  render(data, ctx) {
    const base = (data.questions || []).filter((q) => q.options?.some((o) => o.correct));
    if (!base.length) return h('div', { class: 'rs-empty' }, 'Add a question with a correct answer to get started.');
    const root = h('div');
    let order; let idx; let results;
    const start = () => { order = data.shuffleQuestions ? shuffle(base) : base; idx = 0; results = []; draw(); };
    const draw = () => {
      root.replaceChildren();
      const bar = h('div', { class: 'rs-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': order.length, 'aria-valuenow': idx }, h('div', { style: { width: `${(idx / order.length) * 100}%` } }));
      if (idx >= order.length) {
        const score = results.filter(Boolean).length;
        const pct = Math.round((score / order.length) * 100);
        const pass = pct >= (Number(data.passPercent) || 0);
        root.append(bar, h('div', { class: 'rs-result' },
          h('div', { class: 'big' }, `${score} / ${order.length}`),
          h('p', { class: pass ? 'pass' : 'fail' }, `${pct}% · ${pass ? 'Passed' : 'Not passed yet'}`),
          h('button', { class: 'btn', type: 'button', onclick: start }, 'Try again')));
        ctx.report?.(score, order.length);
        return;
      }
      const q = order[idx];
      const cq = choiceQuestion(q, { shuffleOptions: data.shuffleOptions && q.kind !== 'truefalse' });
      const fb = h('div');
      const next = h('button', { class: 'btn primary hidden', type: 'button', onclick: () => { idx++; draw(); } }, idx === order.length - 1 ? 'See results' : 'Next question');
      const check = h('button', { class: 'btn primary', type: 'button', onclick: () => {
        const ok = cq.check(); if (ok === null) return;
        results[idx] = ok; check.remove(); next.classList.remove('hidden');
        fb.append(feedback(ok, q.feedbackCorrect || 'Correct!', q.feedbackWrong || 'Not quite — the correct answer is highlighted.'));
        next.focus();
      } }, 'Check');
      root.append(bar,
        idx === 0 && data.intro && h('div', { class: 'rs-instructions', html: formatText(data.intro) }),
        h('p', { class: 'rs-status', style: { margin: '0 0 6px' } }, `Question ${idx + 1} of ${order.length}`),
        cq.el, fb, h('div', { class: 'rs-actions' }, check, next));
    };
    start();
    return root;
  },
};
