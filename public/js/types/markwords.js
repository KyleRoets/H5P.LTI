import { h, textField, parseMarked, actionRow } from '../util.js';

export default {
  id: 'markwords',
  name: 'Mark the Words',
  description: 'Learners click the words in a text that match a rule (e.g. all the verbs).',
  icon: '🖍️',
  color: '#d6336c',
  graded: true,
  defaults: () => ({
    instructions: 'Click all the verbs in the text.',
    text: 'The children *ran* to the park and *played* until the sun *set*. Their tired parents *watched* from a bench.',
  }),

  editor(data, ctx) {
    return h('div', {},
      textField('Task description', data, 'instructions', ctx.onChange),
      h('div', { class: 'syntax-tip', html: 'Put each correct word between asterisks: <code>The dog *barked*.</code> Learners see the text without the asterisks.' }),
      textField('Text', data, 'text', ctx.onChange, { multiline: true, rows: 8 }));
  },

  render(data, ctx) {
    const parts = parseMarked(data.text);
    const words = [];
    const body = h('div', { class: 'rs-words' });
    let para = h('p'); body.append(para);
    const addWord = (w, correct) => {
      const b = h('button', { class: 'rs-word', type: 'button', 'aria-pressed': 'false', onclick: () => {
        if (body.dataset.locked) return; b.classList.toggle('selected'); b.setAttribute('aria-pressed', String(b.classList.contains('selected')));
      } }, w);
      b._correct = correct; words.push(b); para.append(b);
    };
    parts.forEach((p) => {
      if (p.marked) { addWord(p.text.trim(), true); return; }
      p.text.split(/(\n{2,}|\s+)/).forEach((tok) => {
        if (!tok) return;
        if (/^\n{2,}$/.test(tok)) { para = h('p'); body.append(para); return; }
        if (/^\s+$/.test(tok)) { para.append(' '); return; }
        // Keep punctuation clickable-free: split leading/trailing punctuation off the word.
        const m = tok.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
        if (m[1]) para.append(m[1]);
        if (m[2]) addWord(m[2], false);
        if (m[3]) para.append(m[3]);
      });
    });
    const max = words.filter((w) => w._correct).length;
    if (!max) return h('div', { class: 'rs-empty' }, 'Mark the correct words with *asterisks*.');
    const actions = actionRow({
      onCheck: () => {
        body.dataset.locked = '1';
        let score = 0;
        words.forEach((w) => {
          const sel = w.classList.contains('selected');
          if (sel && w._correct) { w.classList.add('correct'); score++; } else if (sel) { w.classList.add('wrong'); score--; }
        });
        score = Math.max(0, score);
        actions.checked(score, max);
        ctx.report?.(score, max);
      },
      onRetry: () => { delete body.dataset.locked; words.forEach((w) => { w.classList.remove('correct', 'wrong', 'missed'); if (!w._correct) w.classList.remove('selected'); }); actions.reset(); },
      onShow: () => words.forEach((w) => { if (w._correct && !w.classList.contains('correct')) w.classList.add('missed'); }),
    });
    return h('div', {}, data.instructions && h('p', { class: 'rs-instructions' }, h('strong', {}, data.instructions)), body,
      h('p', { class: 'rs-status' }, 'Wrong clicks take a point off.'), actions.el);
  },
};
