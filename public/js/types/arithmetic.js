import { h, textField, checkField, richField, richBlock, isBlank } from '../util.js';
import { icon } from '../icons.js';

const OPS = { add: '+', sub: '−', mul: '×', div: '÷' };
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function makeQuestion(d) {
  const ops = Object.keys(OPS).filter((k) => d.ops?.[k]);
  const op = ops[Math.floor(Math.random() * ops.length)] || 'add';
  const lo = Number(d.min) || 0; const hi = Math.max(lo, Number(d.max) || 10);
  let a = rint(lo, hi); let b = rint(lo, hi);
  if (op === 'sub' && !d.negatives && b > a) [a, b] = [b, a];
  if (op === 'div') { b = Math.max(1, b || 1); const q = rint(lo, hi); a = b * q; return { a, b, op, answer: q }; }
  const answer = op === 'add' ? a + b : op === 'sub' ? a - b : a * b;
  return { a, b, op, answer };
}

export default {
  id: 'arithmetic',
  name: 'Arithmetic Quiz',
  icon: 'type-arithmetic',
  graded: true,
  category: 'questions',
  tagline: 'Timed mental-maths practice with auto-generated sums.',
  about: {
    summary: 'Generates a fresh set of sums every time — addition, subtraction, multiplication and/or division within a number range you choose. Learners type each answer; an optional timer adds challenge.',
    uses: ['Times-tables and number-bond practice', 'Warm-up starters at the beginning of a lesson', 'Fluency drills with a time limit', 'Differentiated practice (different ranges for different groups)'],
    learners: 'Learners press Start, type each answer and press Enter. They see right or wrong straight away, and a score (and time) at the end. Every attempt gets new numbers.',
    tip: 'Make several versions with different ranges (1–5, 1–10, 1–12) and let learners choose their level.',
  },
  defaults: () => ({ intro: '', ops: { add: true, sub: false, mul: false, div: false }, min: 1, max: 10, count: 10, timeLimit: 0, negatives: false }),
  example: () => ({ title: 'Times tables to 10', data: { intro: '<p>How fast can you answer 10 times-table questions?</p>', ops: { add: false, sub: false, mul: true, div: false }, min: 2, max: 10, count: 10, timeLimit: 60, negatives: false } }),

  editor(data, ctx) {
    data.ops ||= { add: true };
    return h('div', {},
      richField('Introduction (optional)', data, 'intro', ctx.onChange, { compact: true }),
      h('div', { class: 'label' }, 'Operations'),
      h('div', { class: 'check-row' }, ...Object.entries(OPS).map(([k, sym]) => checkField(`${sym}  ${{ add: 'Add', sub: 'Subtract', mul: 'Multiply', div: 'Divide' }[k]}`, data.ops, k, ctx.onChange))),
      h('div', { class: 'field-row' },
        textField('Smallest number', data, 'min', ctx.onChange, { type: 'number' }),
        textField('Largest number', data, 'max', ctx.onChange, { type: 'number' })),
      h('div', { class: 'field-row' },
        textField('Number of questions', data, 'count', ctx.onChange, { type: 'number', min: 1, max: 50 }),
        textField('Time limit in seconds (0 = none)', data, 'timeLimit', ctx.onChange, { type: 'number', min: 0 })),
      checkField('Allow negative answers', data, 'negatives', ctx.onChange),
      h('p', { class: 'help' }, 'For division, answers are always whole numbers.'));
  },

  render(data, ctx) {
    const count = Math.max(1, Math.min(50, Number(data.count) || 10));
    const limit = Number(data.timeLimit) || 0;
    const root = h('div', { class: 'rs-arith' });
    let qs; let idx; let score; let t0; let timer;
    const stop = () => clearInterval(timer);
    const intro = () => {
      stop();
      root.replaceChildren(...[!isBlank(data.intro) && richBlock(data.intro, 'rs-instructions'),
        h('div', { class: 'rs-arith-start' }, h('div', { class: 'big-sym' }, Object.entries(OPS).filter(([k]) => data.ops?.[k]).map(([, s]) => s).join(' ') || '+'),
          h('p', {}, `${count} questions · numbers ${data.min}–${data.max}${limit ? ` · ${limit} seconds` : ''}`),
          h('button', { class: 'btn primary rs-accent-btn', type: 'button', onclick: start }, icon('play', { size: 14 }), h('span', {}, 'Start')))].filter(Boolean));
    };
    const start = () => {
      qs = Array.from({ length: count }, () => makeQuestion(data)); idx = 0; score = 0; t0 = Date.now();
      if (limit) timer = setInterval(() => { if (!root.isConnected) return stop(); const left = limit - Math.floor((Date.now() - t0) / 1000); const t = root.querySelector('.rs-timer'); if (t) t.textContent = `${Math.max(0, left)}s`; if (left <= 0) finish(true); }, 250);
      ask();
    };
    const ask = () => {
      if (idx >= qs.length) return finish(false);
      const q = qs[idx];
      const input = h('input', { type: 'number', inputmode: 'numeric', class: 'rs-arith-input', 'aria-label': 'Your answer' });
      const fb = h('div', { class: 'rs-arith-fb' });
      const submit = () => {
        if (input.value === '' || input.readOnly) return;
        input.readOnly = true;
        const ok = Number(input.value) === q.answer;
        if (ok) score++;
        ctx.record?.({ key: `a${idx}`, question: `${q.a} ${OPS[q.op]} ${q.b}`, answer: input.value, correct: String(q.answer), ok });
        fb.replaceChildren(h('span', { class: ok ? 'ok' : 'no' }, icon(ok ? 'check' : 'x', { size: 16, stroke: 3 }), ok ? ' Correct' : ` ${q.answer}`));
        input.classList.add(ok ? 'correct' : 'wrong');
        setTimeout(() => { idx++; ask(); }, ok ? 450 : 1100);
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      root.replaceChildren(
        h('div', { class: 'rs-arith-top' }, h('span', { class: 'rs-status' }, `Question ${idx + 1} of ${qs.length}`), limit ? h('span', { class: 'rs-timer' }, `${limit}s`) : h('span', { class: 'rs-score' }, `${score} correct`)),
        h('div', { class: 'rs-progress' }, h('div', { style: { width: `${(idx / qs.length) * 100}%` } })),
        h('div', { class: 'rs-arith-q' }, h('span', {}, `${q.a} ${OPS[q.op]} ${q.b} =`), input),
        fb, h('div', { class: 'rs-actions' }, h('button', { class: 'btn primary rs-accent-btn', type: 'button', onclick: submit }, h('span', {}, 'Answer'), icon('chevron-right', { size: 16 }))));
      input.focus();
    };
    const finish = (timedOut) => {
      stop();
      const secs = Math.round((Date.now() - t0) / 1000);
      root.replaceChildren(h('div', { class: 'rs-result' },
        h('div', { class: 'big' }, `${score} / ${qs.length}`),
        h('p', {}, timedOut ? 'Time\'s up!' : `Finished in ${secs} seconds.`),
        h('button', { class: 'btn rs-retry', type: 'button', onclick: start }, icon('restore', { size: 16 }), h('span', {}, 'New questions'))));
      ctx.report?.(score, qs.length);
    };
    intro();
    return root;
  },
};
