import { h, checkField, actionRow, richField, richBlock, isBlank, emptyState } from '../util.js';
import { buildAnswerText } from './_shared.js';

const answersOf = (s) => s.split('/').map((a) => a.trim()).filter(Boolean);

export default {
  id: 'blanks',
  name: 'Fill in the Blanks',
  icon: 'type-blanks',
  graded: true,
  tagline: 'Learners type the missing words into a text.',
  about: {
    summary: 'You write a passage and mark the words learners must supply. Learners see the passage with empty boxes and type the missing words. You can accept alternative answers (for example both "colour" and "color").',
    uses: ['Recall key vocabulary or definitions', 'Complete formulas, dates, names or numbers', 'Language practice (verb endings, spelling, grammar)', 'Summaries where learners fill in the main ideas'],
    learners: 'Learners type into each gap (Enter moves to the next one) and press Check. Correct answers turn green; for wrong ones they can try again or show the answers.',
    tip: 'Select a word in your text and press "Make answer". To accept alternatives, make the answer read "colour/color" — any of the options separated by "/" will be marked correct.',
  },
  defaults: () => ({ instructions: '', html: '', caseSensitive: false }),
  example: () => ({
    title: 'The cell',
    data: { instructions: '<p>Fill in the missing words.</p>', html: '<p>The <mark>nucleus</mark> controls the cell and contains <mark>DNA</mark>.</p><p>Energy is released in the <mark>mitochondria/mitochondrion</mark> through respiration.</p>', caseSensitive: false },
  }),

  editor(data, ctx) {
    return h('div', {},
      richField('Instructions (optional)', data, 'instructions', ctx.onChange, { compact: true, placeholder: 'e.g. Fill in the missing words.' }),
      richField('Text', data, 'html', ctx.onChange, {
        answers: 'blank',
        placeholder: 'Type your text, then select a word and press "Make answer".',
        help: 'Answers are highlighted. To accept alternatives write them with a slash, e.g. colour/color. Press "Make answer" again inside a highlight to remove it.',
      }),
      checkField('Answers are case sensitive', data, 'caseSensitive', ctx.onChange));
  },

  render(data, ctx) {
    const blanks = [];
    const body = buildAnswerText(data, {
      mark: (text) => {
        const answers = answersOf(text);
        const input = h('input', { type: 'text', 'aria-label': `Blank ${blanks.length + 1}`, autocomplete: 'off', spellcheck: 'false', size: Math.max(6, Math.max(0, ...answers.map((a) => a.length)) + 2) });
        const sol = h('span', { class: 'rs-solution hidden' });
        blanks.push({ input, answers, sol });
        return h('span', { class: 'rs-answer-el' }, input, sol);
      },
    });
    body.classList.add('rs-cloze');
    if (!blanks.length) return emptyState('type-blanks', 'Write your text, then select words and press "Make answer".');
    const norm = (s) => (data.caseSensitive ? s.trim() : s.trim().toLowerCase()).replace(/\s+/g, ' ');
    const actions = actionRow({
      onCheck: () => {
        let score = 0;
        blanks.forEach((b) => {
          const ok = b.answers.some((a) => norm(a) === norm(b.input.value));
          b.input.classList.add(ok ? 'correct' : 'wrong'); b.input.readOnly = true;
          if (ok) score++;
        });
        actions.checked(score, blanks.length);
        ctx.report?.(score, blanks.length);
      },
      onRetry: () => {
        // Keep correct answers, clear the wrong ones so learners can try again.
        blanks.forEach((b) => { if (b.input.classList.contains('wrong')) b.input.value = ''; b.input.className = ''; b.input.readOnly = false; b.sol.classList.add('hidden'); });
        actions.reset(); blanks[0].input.focus();
      },
      onShow: () => blanks.forEach((b) => { if (b.input.classList.contains('wrong')) { b.sol.textContent = `→ ${b.answers[0]}`; b.sol.classList.remove('hidden'); } }),
    });
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); const i = blanks.findIndex((b) => b.input === e.target); blanks[i + 1]?.input.focus(); } });
    return h('div', {}, !isBlank(data.instructions) && richBlock(data.instructions, 'rs-instructions'), body, actions.el);
  },
};
