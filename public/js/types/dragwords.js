import { h, textField, shuffle, dragSystem, actionRow, richField, richBlock, isBlank, emptyState } from '../util.js';
import { buildAnswerText } from './_shared.js';

export default {
  id: 'dragwords',
  name: 'Drag the Words',
  icon: 'type-dragwords',
  graded: true,
  tagline: 'Learners drag words into the gaps in a text.',
  about: {
    summary: 'Like Fill in the Blanks, but learners don\'t type — they drag the missing words from a word bank into the gaps. You can add extra wrong words to the bank to make it harder.',
    uses: ['Vocabulary and key terms for younger learners or language learners', 'Completing sentences, processes or timelines', 'Activities that need to work well on tablets and phones', 'Checking understanding without spelling getting in the way'],
    learners: 'Learners drag each word into a gap (or tap a word, then tap a gap) and press Check. Wrong words go back to the bank when they try again.',
    tip: 'Select a word in your text and press "Make answer". Add two or three believable extra words so the last gap isn\'t a giveaway.',
  },
  defaults: () => ({ instructions: '', html: '', distractors: '' }),
  example: () => ({
    title: 'Photosynthesis',
    data: { instructions: '<p>Drag the words into the gaps.</p>', html: '<p>Plants make their food through <mark>photosynthesis</mark>, using energy from the <mark>sun</mark>.</p><p>The green pigment that captures light is called <mark>chlorophyll</mark>.</p>', distractors: 'moon, oxygen' },
  }),

  editor(data, ctx) {
    return h('div', {},
      richField('Instructions (optional)', data, 'instructions', ctx.onChange, { compact: true, placeholder: 'e.g. Drag the words into the gaps.' }),
      richField('Text', data, 'html', ctx.onChange, { answers: 'blank', placeholder: 'Type your text, then select a word and press "Make answer".', help: 'Each highlighted word becomes a gap, and the word goes into the word bank.' }),
      textField('Extra wrong words (optional)', data, 'distractors', ctx.onChange, { placeholder: 'e.g. moon, oxygen', help: 'Separate with commas. They appear in the word bank but don\'t belong in any gap.' }));
  },

  render(data, ctx) {
    const root = h('div');
    const slots = [];
    const body = buildAnswerText(data, {
      mark: (text) => {
        const slot = h('span', { class: 'rs-slot rs-answer-el', 'data-drop': `s${slots.length}`, tabindex: '0', 'aria-label': `Gap ${slots.length + 1}` });
        slot._answer = text;
        slots.push(slot);
        return slot;
      },
    });
    body.classList.add('rs-cloze');
    if (!slots.length) return emptyState('type-dragwords', 'Write your text, then select words and press "Make answer".');
    const extra = String(data.distractors || '').split(',').map((s) => s.trim()).filter(Boolean);
    const bank = h('div', { class: 'rs-bank', 'data-drop': 'bank', tabindex: '0', 'aria-label': 'Word bank' });
    const words = shuffle([...slots.map((s) => s._answer), ...extra]).map((w) => { const el = h('span', { class: 'rs-drag', tabindex: '0', role: 'button' }, w); el._w = w; return el; });
    bank.append(...words);
    dragSystem(root, {
      onDrop: (el, target) => {
        if (target.classList.contains('rs-slot')) { const prev = target.querySelector('.rs-drag'); if (prev && prev !== el) bank.append(prev); }
        target.append(el);
      },
    });
    const actions = actionRow({
      onCheck: () => {
        root.dataset.locked = '1';
        let score = 0;
        slots.forEach((s) => {
          const el = s.querySelector('.rs-drag');
          if (!el) return;
          const ok = el._w === s._answer;
          el.classList.add(ok ? 'correct' : 'wrong'); if (ok) score++;
        });
        actions.checked(score, slots.length);
        ctx.report?.(score, slots.length);
      },
      onRetry: () => {
        delete root.dataset.locked;
        slots.forEach((s) => { const el = s.querySelector('.rs-drag'); if (el?.classList.contains('wrong')) bank.append(el); });
        words.forEach((el) => el.classList.remove('wrong', 'correct'));
        actions.reset();
      },
      onShow: () => {
        words.forEach((el) => { el.classList.remove('wrong'); bank.append(el); });
        const pool = [...words];
        slots.forEach((s) => { const i = pool.findIndex((el) => el._w === s._answer); if (i >= 0) { const [el] = pool.splice(i, 1); el.classList.add('correct'); s.append(el); } });
      },
    });
    root.append(...[!isBlank(data.instructions) && richBlock(data.instructions, 'rs-instructions'), body, h('div', { class: 'rs-bank-wrap' }, bank), actions.el].filter(Boolean));
    return root;
  },
};
