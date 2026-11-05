import { h, textField, parseMarked, shuffle, dragSystem, actionRow, esc } from '../util.js';

export default {
  id: 'dragwords',
  name: 'Drag the Words',
  description: 'Learners drag missing words into gaps in a text.',
  icon: '🔤',
  color: '#f08c00',
  graded: true,
  defaults: () => ({
    instructions: 'Drag the words into the correct gaps.',
    text: 'Plants make food through *photosynthesis*, using energy from the *sun*.\n\nThe green pigment that captures light is called *chlorophyll*.',
    distractors: '',
  }),

  editor(data, ctx) {
    return h('div', {},
      textField('Instructions', data, 'instructions', ctx.onChange),
      h('div', { class: 'syntax-tip', html: 'Put each draggable word between asterisks: <code>The sky is *blue*.</code>' }),
      textField('Text', data, 'text', ctx.onChange, { multiline: true, rows: 9 }),
      textField('Extra wrong words (optional)', data, 'distractors', ctx.onChange, { help: 'Comma-separated words that don\'t belong anywhere, to make it harder.' }));
  },

  render(data, ctx) {
    const parts = parseMarked(data.text);
    const root = h('div');
    const body = h('div', { class: 'rs-cloze' });
    const slots = [];
    let para = h('p'); body.append(para);
    parts.forEach((p) => {
      if (p.marked) {
        const slot = h('span', { class: 'rs-slot', 'data-drop': `s${slots.length}`, tabindex: '0', 'aria-label': `Gap ${slots.length + 1}` });
        slot._answer = p.text.trim();
        slots.push(slot); para.append(slot);
      } else {
        p.text.split(/(\n{2,})/).forEach((chunk) => {
          if (/^\n{2,}$/.test(chunk)) { para = h('p'); body.append(para); } else para.append(h('span', { html: esc(chunk).replace(/\n/g, '<br>') }));
        });
      }
    });
    if (!slots.length) return h('div', { class: 'rs-empty' }, 'Mark words with *asterisks* in the text.');
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
    root.append(data.instructions && h('p', { class: 'rs-instructions' }, data.instructions), body, h('div', { style: { marginTop: '12px' } }, bank), actions.el);
    return root;
  },
};
