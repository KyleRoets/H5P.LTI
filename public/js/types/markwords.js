import { h, actionRow, richField, richBlock, isBlank, emptyState } from '../util.js';
import { buildAnswerText } from './_shared.js';

export default {
  id: 'markwords',
  name: 'Mark the Words',
  icon: 'type-markwords',
  graded: true,
  tagline: 'Learners click the words in a text that match a rule.',
  about: {
    summary: 'You write a passage and mark which words are correct (for example, all the verbs, or every word that is spelt wrong). Learners see the plain text and click the words they think match.',
    uses: ['Grammar: find the nouns, verbs or adjectives', 'Spot the mistakes in a sentence or paragraph', 'Find evidence in a passage (e.g. words that show emotion)', 'Identify key terms in a reading'],
    learners: 'Learners click words to highlight them and press Check. Correct picks turn green, wrong picks are crossed out (and cost a point), and missed words can be revealed.',
    tip: 'Say exactly what to look for in the task description — "Click all the verbs (there are 4)" works better than "Find the verbs".',
  },
  defaults: () => ({ instructions: '', html: '' }),
  example: () => ({
    title: 'Find the verbs',
    data: { instructions: '<p><strong>Click all the verbs (there are 4).</strong></p>', html: '<p>The children <mark>ran</mark> to the park and <mark>played</mark> until the sun <mark>set</mark>. Their tired parents <mark>watched</mark> from a bench.</p>' },
  }),

  editor(data, ctx) {
    return h('div', {},
      richField('Task description', data, 'instructions', ctx.onChange, { compact: true, placeholder: 'e.g. Click all the verbs (there are 4).' }),
      richField('Text', data, 'html', ctx.onChange, { answers: 'word', placeholder: 'Type your text, then select each correct word and press "Mark as correct".', help: 'Learners see the text without highlights. Mark single words.' }));
  },

  render(data, ctx) {
    const words = [];
    let locked = false;
    const word = (text, correct) => {
      const b = h('button', { class: 'rs-word rs-answer-el', type: 'button', 'aria-pressed': 'false', onclick: () => {
        if (locked) return; b.classList.toggle('selected'); b.setAttribute('aria-pressed', String(b.classList.contains('selected')));
      } }, text);
      b._correct = correct; words.push(b);
      return b;
    };
    const body = buildAnswerText(data, { mark: (t) => word(t, true), word: (t) => word(t, false) });
    body.classList.add('rs-words');
    const max = words.filter((w) => w._correct).length;
    if (!max) return emptyState('type-markwords', 'Write your text, then select the correct words and press "Mark as correct".');
    const actions = actionRow({
      onCheck: () => {
        locked = true;
        let score = 0;
        words.forEach((w) => {
          const sel = w.classList.contains('selected');
          if (sel && w._correct) { w.classList.add('correct'); score++; } else if (sel) { w.classList.add('wrong'); score--; }
        });
        score = Math.max(0, score);
        actions.checked(score, max);
        ctx.report?.(score, max);
      },
      onRetry: () => { locked = false; words.forEach((w) => { w.classList.remove('correct', 'wrong', 'missed'); if (!w._correct) w.classList.remove('selected'); }); actions.reset(); },
      onShow: () => words.forEach((w) => { if (w._correct && !w.classList.contains('correct')) w.classList.add('missed'); }),
    });
    return h('div', {}, !isBlank(data.instructions) && richBlock(data.instructions, 'rs-instructions'), body,
      h('p', { class: 'rs-status' }, 'Wrong clicks take a point off.'), actions.el);
  },
};
