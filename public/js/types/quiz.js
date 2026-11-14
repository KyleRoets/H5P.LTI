import { h, textField, selectField, checkField, mediaField, listEditor, optionsEditor, choiceQuestion, feedback, richField, richBlock, isBlank, shuffle, emptyState, htmlToText, checkLabel } from '../util.js';
import { icon } from '../icons.js';

const newQ = (kind = 'choice') => (kind === 'truefalse'
  ? { kind, text: '', image: '', options: [{ text: 'True', correct: true }, { text: 'False', correct: false }], feedbackCorrect: '', feedbackWrong: '' }
  : { kind, text: '', image: '', options: [{ text: '', correct: true }, { text: '', correct: false }, { text: '', correct: false }], feedbackCorrect: '', feedbackWrong: '' });
const plain = htmlToText;

export default {
  id: 'quiz',
  name: 'Quiz',
  icon: 'type-quiz',
  graded: true,
  tagline: 'Multiple choice and true/false questions with a final score.',
  about: {
    summary: 'A set of questions shown one at a time, with instant feedback after each answer and a score at the end. Questions can be single answer, "select all that apply" or true/false, and can include a picture.',
    uses: ['Quick knowledge checks at the end of a page or module', 'Practice quizzes before a test', 'Graded quizzes that send the score to the gradebook', 'Pre-lesson questions to see what learners already know'],
    learners: 'Learners choose an answer, press Check to see whether they were right (with your feedback), then move to the next question. At the end they see their score and can try again.',
    tip: 'Write feedback that explains why an answer is right or wrong — that is where most of the learning happens. Shuffle the answers so learners can\'t memorise positions.',
  },
  defaults: () => ({ intro: '', passPercent: 70, shuffleQuestions: false, shuffleOptions: true, questions: [newQ()] }),
  example: () => ({
    title: 'Cell quiz',
    data: { intro: '<p>Three quick questions about cells.</p>', passPercent: 60, shuffleQuestions: false, shuffleOptions: false, questions: [
      { kind: 'choice', text: '<p>Which part of the cell releases energy?</p>', image: '', options: [{ text: 'Mitochondrion', correct: true }, { text: 'Ribosome', correct: false }, { text: 'Nucleus', correct: false }], feedbackCorrect: 'Yes — respiration happens in the mitochondria.', feedbackWrong: 'Not quite: energy is released in the mitochondria.' },
      { kind: 'truefalse', text: '<p>Animal cells have a cell wall.</p>', image: '', options: [{ text: 'True', correct: false }, { text: 'False', correct: true }], feedbackCorrect: 'Correct — only plant cells (and some others) have a cell wall.', feedbackWrong: '' },
      { kind: 'choice', text: '<p>Select <strong>all</strong> the parts found in plant cells.</p>', image: '', options: [{ text: 'Chloroplast', correct: true }, { text: 'Cell wall', correct: true }, { text: 'Gills', correct: false }], feedbackCorrect: '', feedbackWrong: '' },
    ] },
  }),

  editor(data, ctx) {
    return h('div', {},
      richField('Introduction (optional)', data, 'intro', ctx.onChange, { compact: true, placeholder: 'Shown above the first question.' }),
      listEditor({
        items: data.questions, label: 'Questions', addText: 'Add question', min: 1, onChange: ctx.onChange, startCollapsed: data.questions.length > 3,
        itemLabel: (q, i) => `${i + 1}. ${q.kind === 'truefalse' ? 'True/False · ' : ''}${plain(q.text) || 'Untitled question'}`,
        create: () => newQ(),
        renderItem: (q, i, changed) => {
          const optHost = h('div');
          const drawOpts = () => optHost.replaceChildren(optionsEditor(q, changed, { multi: q.kind !== 'truefalse', fixed: q.kind === 'truefalse' }));
          drawOpts();
          return h('div', {},
            selectField('Question type', q, 'kind', [['choice', 'Multiple choice'], ['truefalse', 'True / False']], changed, {
              after: () => { if (q.kind === 'truefalse') q.options = newQ('truefalse').options; else if (q.options.length < 2 || q.options[0].text === 'True') q.options = newQ().options; changed(); drawOpts(); },
            }),
            richField('Question', q, 'text', changed, { compact: true, placeholder: 'Type your question…' }),
            mediaField('Picture (optional)', q, 'image', changed, ctx),
            optHost,
            q.kind !== 'truefalse' && h('p', { class: 'help' }, 'Tick more than one answer to make it a "select all that apply" question.'),
            h('details', { class: 'more' }, h('summary', {}, 'Feedback'),
              richField('If correct', q, 'feedbackCorrect', changed, { compact: true, placeholder: 'Correct!' }),
              richField('If wrong', q, 'feedbackWrong', changed, { compact: true, placeholder: 'Not quite — the correct answer is highlighted.' })));
        },
      }),
      h('div', { class: 'section-title' }, 'Quiz settings'),
      h('div', { class: 'field-row' },
        textField('Pass mark (%)', data, 'passPercent', ctx.onChange, { type: 'number', min: 0, max: 100 }),
        h('div', {}, checkField('Shuffle question order', data, 'shuffleQuestions', ctx.onChange), checkField('Shuffle answers', data, 'shuffleOptions', ctx.onChange))));
  },

  render(data, ctx) {
    const base = (data.questions || []).filter((q) => (q._secure || q.options?.some((o) => o.correct)) && (plain(q.text) || q.image));
    if (!base.length) return emptyState('type-quiz', 'Write a question and tick its correct answer to get started.');
    const root = h('div', { class: 'rs-quiz' });
    let order; let idx; let results;
    const start = () => { order = data.shuffleQuestions ? shuffle(base) : base; idx = 0; results = []; draw(); };
    const draw = () => {
      root.replaceChildren();
      const bar = h('div', { class: 'rs-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': order.length, 'aria-valuenow': idx }, h('div', { style: { width: `${(idx / order.length) * 100}%` } }));
      if (idx >= order.length && order.some((q) => q._secure)) {
        // Exam mode: the page doesn't know the answers, so there is no score to show here.
        root.append(bar, h('div', { class: 'rs-result rs-done-note' }, h('div', { class: 'result-badge pass' }, icon('check', { size: 28 })),
          h('p', {}, `All ${order.length} questions answered. Press Submit to hand in your answers.`)));
        ctx.report?.(0, order.length);
        return;
      }
      if (idx >= order.length) {
        const score = results.filter(Boolean).length;
        const pct = Math.round((score / order.length) * 100);
        const pass = pct >= (Number(data.passPercent) || 0);
        root.append(bar, h('div', { class: 'rs-result' },
          h('div', { class: `result-badge ${pass ? 'pass' : 'fail'}` }, icon(pass ? 'award' : 'restore', { size: 28 })),
          h('div', { class: 'big' }, `${score} / ${order.length}`),
          h('p', { class: pass ? 'pass' : 'fail' }, `${pct}% · ${pass ? 'Passed' : 'Not passed yet'}`),
          h('button', { class: 'btn rs-retry', type: 'button', onclick: start }, icon('restore', { size: 16 }), h('span', {}, 'Try again'))));
        ctx.report?.(score, order.length);
        return;
      }
      const q = order[idx];
      const cq = choiceQuestion(q, { shuffleOptions: data.shuffleOptions && q.kind !== 'truefalse' });
      const fb = h('div');
      const next = h('button', { class: 'btn primary rs-accent-btn hidden', type: 'button', onclick: () => { idx++; draw(); } }, h('span', {}, idx === order.length - 1 ? 'See results' : 'Next question'), icon('chevron-right', { size: 16 }));
      const check = h('button', { class: 'btn primary rs-accent-btn', type: 'button', onclick: () => {
        const ok = cq.check(); if (ok === null) return;
        results[idx] = ok; check.remove(); next.classList.remove('hidden');
        ctx.record?.({ key: `q${(data.questions || []).indexOf(q)}`, question: htmlToText(q.text) || `Question ${idx + 1}`, ...cq.describe() });
        fb.append(feedback(ok, isBlank(q.feedbackCorrect) ? 'Correct!' : q.feedbackCorrect, isBlank(q.feedbackWrong) ? 'Not quite — the correct answer is highlighted.' : q.feedbackWrong));
        next.focus();
      } }, icon('check', { size: 16 }), h('span', {}, checkLabel()));
      root.append(bar,
        idx === 0 && !isBlank(data.intro) && richBlock(data.intro, 'rs-instructions'),
        h('p', { class: 'rs-status' }, `Question ${idx + 1} of ${order.length}`),
        cq.el, fb, h('div', { class: 'rs-actions' }, check, next));
    };
    start();
    return root;
  },
};
