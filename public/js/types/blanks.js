import { h, textField, checkField, parseMarked, actionRow, esc } from '../util.js';

const answersOf = (s) => s.split('/').map((a) => a.trim()).filter(Boolean);

export default {
  id: 'blanks',
  name: 'Fill in the Blanks',
  description: 'Learners type missing words into a text. Accepts alternative answers.',
  icon: '✏️',
  color: '#0c8599',
  graded: true,
  defaults: () => ({
    instructions: 'Fill in the missing words.',
    text: 'The capital of France is *Paris*.\n\nWater boils at *100* degrees Celsius and freezes at *0* degrees.\n\nA word that sounds like another is a *homophone/homonym*.',
    caseSensitive: false,
  }),

  editor(data, ctx) {
    return h('div', {},
      textField('Instructions', data, 'instructions', ctx.onChange),
      h('div', { class: 'syntax-tip', html: 'Put each answer between asterisks: <code>The sky is *blue*.</code><br>Allow alternatives with a slash: <code>*colour/color*</code>' }),
      textField('Text', data, 'text', ctx.onChange, { multiline: true, rows: 10 }),
      checkField('Answers are case sensitive', data, 'caseSensitive', ctx.onChange));
  },

  render(data, ctx) {
    const parts = parseMarked(data.text);
    const blanks = [];
    const body = h('div', { class: 'rs-cloze' });
    // Rebuild paragraphs while keeping inputs inline.
    let para = h('p');
    body.append(para);
    parts.forEach((p) => {
      if (p.marked) {
        const answers = answersOf(p.text);
        const input = h('input', { type: 'text', 'aria-label': `Blank ${blanks.length + 1}`, autocomplete: 'off', spellcheck: 'false', size: Math.max(6, Math.max(...answers.map((a) => a.length)) + 2) });
        const sol = h('span', { class: 'rs-solution hidden' });
        blanks.push({ input, answers, sol });
        para.append(input, sol);
      } else {
        p.text.split(/(\n{2,})/).forEach((chunk) => {
          if (/^\n{2,}$/.test(chunk)) { para = h('p'); body.append(para); } else para.append(h('span', { html: esc(chunk).replace(/\n/g, '<br>') }));
        });
      }
    });
    if (!blanks.length) return h('div', { class: 'rs-empty' }, 'Mark answers with *asterisks* in the text.');
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
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); const i = blanks.findIndex((b) => b.input === e.target); (blanks[i + 1]?.input)?.focus(); } });
    return h('div', {}, data.instructions && h('p', { class: 'rs-instructions' }, data.instructions), body, actions.el);
  },
};
