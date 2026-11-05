import { h, textField, listEditor, richField, richBlock, isBlank, emptyState } from '../util.js';
import { icon } from '../icons.js';
import { normalize } from './_shared.js';

export default {
  id: 'essay',
  name: 'Essay',
  icon: 'type-essay',
  graded: true,
  category: 'questions',
  tagline: 'Learners write a free-text answer, checked against key words.',
  about: {
    summary: 'Learners write a longer answer in their own words. You list the key words or ideas a good answer should mention (with alternatives), and learners get instant feedback on which ones they included, plus your sample answer.',
    uses: ['Short written explanations ("Explain why…")', 'Reflection after an activity', 'Practising key vocabulary in context', 'Self-assessment against a model answer'],
    learners: 'Learners type their answer and press Check. They see how many key ideas they covered, feedback for each, and your sample answer to compare with.',
    tip: 'Automatic keyword checking is a guide, not a full mark scheme. Add alternatives (e.g. "photosynthesis/photosynthesise") and keep the scoring formative.',
  },
  defaults: () => ({ task: '', placeholder: '', minChars: 0, keywords: [], sample: '' }),
  example: () => ({
    title: 'Why do cells need mitochondria?',
    data: { task: '<p>In 2–3 sentences, explain why cells need <strong>mitochondria</strong>.</p>', placeholder: 'Write your answer here…', minChars: 40, sample: '<p>Mitochondria carry out respiration, which releases energy from glucose. Cells need this energy to grow, move and make new materials.</p>',
      keywords: [
        { words: 'energy', found: 'You mentioned energy.', missing: 'What do mitochondria release?' },
        { words: 'respiration/respire', found: 'Good — respiration is the process.', missing: 'Name the process that happens in mitochondria.' },
        { words: 'glucose/sugar/food', found: 'Yes, energy comes from glucose.', missing: 'Where does the energy come from?' },
      ] },
  }),

  editor(data, ctx) {
    return h('div', {},
      richField('Task', data, 'task', ctx.onChange, { compact: true, placeholder: 'e.g. Explain why…' }),
      h('div', { class: 'field-row' },
        textField('Hint inside the answer box', data, 'placeholder', ctx.onChange, { placeholder: 'Write your answer here…' }),
        textField('Minimum length (characters)', data, 'minChars', ctx.onChange, { type: 'number', min: 0 })),
      listEditor({
        items: data.keywords, label: 'Key words or ideas', addText: 'Add key word', onChange: ctx.onChange,
        empty: 'Add the words or ideas a good answer should include. Each one found earns a point.',
        itemLabel: (k, i) => `${i + 1}. ${k.words || 'Untitled'}`,
        create: () => ({ words: '', found: '', missing: '' }),
        renderItem: (k, i, changed) => h('div', {},
          textField('Word or phrase', k, 'words', changed, { placeholder: 'e.g. energy — alternatives with a slash: colour/color' }),
          textField('Feedback if included', k, 'found', changed),
          textField('Feedback if missing', k, 'missing', changed)),
      }),
      richField('Sample answer (shown after checking)', data, 'sample', ctx.onChange, { compact: true }));
  },

  render(data, ctx) {
    if (isBlank(data.task)) return emptyState('type-essay', 'Write the task to get started.');
    const kws = (data.keywords || []).filter((k) => k.words?.trim());
    const ta = h('textarea', { class: 'rs-essay', rows: 7, placeholder: data.placeholder || 'Write your answer here…', 'aria-label': 'Your answer' });
    const count = h('span', { class: 'rs-status' });
    const min = Number(data.minChars) || 0;
    const upd = () => { count.textContent = `${ta.value.length} characters${min ? ` (at least ${min})` : ''}`; };
    ta.addEventListener('input', upd); upd();
    const out = h('div');
    const check = h('button', { class: 'btn primary rs-accent-btn', type: 'button', onclick: () => {
      if (ta.value.trim().length < min) { out.replaceChildren(h('div', { class: 'rs-feedback bad' }, icon('info', { size: 16 }), h('span', {}, `Please write at least ${min} characters.`))); return; }
      const text = ` ${normalize(ta.value)} `;
      const results = kws.map((k) => ({ k, ok: k.words.split('/').map(normalize).filter(Boolean).some((w) => text.includes(` ${w} `) || text.includes(` ${w}`)) }));
      const score = results.filter((r) => r.ok).length;
      out.replaceChildren(...[
        kws.length > 0 && h('div', { class: 'rs-score-line' }, h('span', { class: 'rs-score' }, `${score} / ${kws.length} key ideas`)),
        kws.length > 0 && h('ul', { class: 'rs-kw' }, results.map((r) => h('li', { class: r.ok ? 'ok' : 'no' }, icon(r.ok ? 'check' : 'x', { size: 14, stroke: 3 }), h('span', {}, r.ok ? (r.k.found || `Included: ${r.k.words.split('/')[0]}`) : (r.k.missing || `Missing: ${r.k.words.split('/')[0]}`))))),
        !isBlank(data.sample) && h('div', { class: 'rs-sample' }, h('h4', {}, 'Sample answer'), richBlock(data.sample))].filter(Boolean));
      ta.readOnly = true; check.classList.add('hidden'); retry.classList.remove('hidden');
      if (kws.length) ctx.report?.(score, kws.length);
    } }, icon('check', { size: 16 }), h('span', {}, 'Check'));
    const retry = h('button', { class: 'btn hidden', type: 'button', onclick: () => { ta.readOnly = false; out.replaceChildren(); retry.classList.add('hidden'); check.classList.remove('hidden'); ta.focus(); } }, icon('edit', { size: 16 }), h('span', {}, 'Edit my answer'));
    return h('div', {}, richBlock(data.task, 'rs-instructions rs-task'), ta, count, h('div', { class: 'rs-actions' }, check, retry), out);
  },
};
