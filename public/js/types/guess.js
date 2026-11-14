import { h, textField, mediaField, listEditor, safeUrl, richField, richBlock, isBlank, emptyState } from '../util.js';
import { icon } from '../icons.js';

export default {
  id: 'guess',
  name: 'Guess the Answer',
  icon: 'type-guess',
  graded: false,
  category: 'media',
  tagline: 'A picture and a question — learners think, then reveal the answer.',
  about: {
    summary: 'Show an image with a question and let learners think before they click to reveal the answer. Add several to make a quick round of "guess what this is".',
    uses: ['"What is this?" starters with close-up or unusual photos', 'Predict-then-reveal moments', 'Thinking prompts before a new topic', 'Low-stakes retrieval practice'],
    learners: 'Learners look at the picture, think of their answer, then press the reveal button to check.',
    tip: 'Close-ups, unusual angles or partially hidden objects make the best "guess" pictures.',
  },
  defaults: () => ({ items: [{ image: '', question: '', answer: '', button: '' }] }),
  example: () => ({ title: 'Guess the organelle', data: { items: [
    { image: '/img/examples/cell.png', question: 'What is the purple circle in the middle?', answer: '<p>The <strong>nucleus</strong> — it controls the cell.</p>', button: '' },
  ] } }),

  editor(data, ctx) {
    return listEditor({
      items: data.items, label: 'Questions', addText: 'Add another', min: 1, onChange: ctx.onChange,
      itemLabel: (it, i) => `${i + 1}. ${it.question || 'Untitled'}`,
      create: () => ({ image: '', question: '', answer: '', button: '' }),
      renderItem: (it, i, changed) => h('div', {}, mediaField('Picture', it, 'image', changed, ctx), textField('Question', it, 'question', changed, { placeholder: 'e.g. What do you think this is?' }), richField('Answer', it, 'answer', changed, { compact: true }), textField('Button text (optional)', it, 'button', changed, { placeholder: 'Reveal the answer' })),
    });
  },

  render(data) {
    const items = (data.items || []).filter((i) => safeUrl(i.image) || i.question?.trim());
    if (!items.length) return emptyState('type-guess', 'Add a picture and a question.');
    return h('div', { class: 'rs-guess-list' }, items.map((it) => {
      const ans = h('div', { class: 'rs-guess-answer hidden', 'aria-live': 'polite' }, !isBlank(it.answer) && richBlock(it.answer));
      const btn = h('button', { class: 'btn primary rs-accent-btn', type: 'button', onclick: () => { ans.classList.remove('hidden'); btn.remove(); } }, icon('eye', { size: 16 }), h('span', {}, it.button || 'Reveal the answer'));
      return h('div', { class: 'rs-guess' }, safeUrl(it.image) && h('img', { src: safeUrl(it.image), alt: '' }), h('div', { class: 'body' }, it.question && h('p', { class: 'rs-question-text' }, it.question), btn, ans));
    }));
  },
};
