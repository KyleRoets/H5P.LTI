import { h, textField, mediaField, listEditor, safeUrl, richField, richBlock, isBlank, dragSystem, actionRow, emptyState, rid, shuffle } from '../util.js';

const label = (side) => [side.text, safeUrl(side.image) ? '(image)' : ''].filter(Boolean).join(' ') || 'Empty';
const face = (side) => [safeUrl(side.image) && h('img', { src: safeUrl(side.image), alt: side.text || '' }), side.text && h('span', {}, side.text)];

export default {
  id: 'matching',
  name: 'Matching Pairs',
  icon: 'type-matching',
  graded: true,
  category: 'questions',
  tagline: 'Learners match each item with its partner — words, images or both.',
  about: {
    summary: 'You create pairs (word ↔ definition, picture ↔ name, question ↔ answer, picture ↔ picture). Learners see the left-hand items in order and drag the shuffled partners next to them.',
    uses: ['Terms and definitions', 'Pictures and their names (or two related pictures)', 'Countries and capitals, authors and books, causes and effects', 'Vocabulary in two languages'],
    learners: 'Learners drag each partner into the empty slot beside its match (or tap a partner, then tap a slot), then press Check. Each correct pair earns a point.',
    tip: 'Keep partners short so they fit in the slots. Mix text and images to make it more visual.',
  },
  defaults: () => ({ task: '', pairs: [{ id: rid(), a: { text: '', image: '' }, b: { text: '', image: '' } }, { id: rid(), a: { text: '', image: '' }, b: { text: '', image: '' } }] }),
  example: () => ({
    title: 'Organelles and jobs',
    data: { task: '<p>Match each part of the cell to its job.</p>', pairs: [
      { id: 'p1', a: { text: 'Nucleus', image: '' }, b: { text: 'Controls the cell', image: '' } },
      { id: 'p2', a: { text: 'Mitochondrion', image: '' }, b: { text: 'Releases energy', image: '' } },
      { id: 'p3', a: { text: 'Cell wall', image: '' }, b: { text: 'Supports the cell', image: '' } },
      { id: 'p4', a: { text: 'Ribosome', image: '' }, b: { text: 'Makes proteins', image: '' } },
    ] },
  }),

  editor(data, ctx) {
    return h('div', {},
      richField('Task', data, 'task', ctx.onChange, { compact: true, placeholder: 'e.g. Match each word to its meaning.' }),
      listEditor({
        items: data.pairs, label: 'Pairs', addText: 'Add pair', min: 2, onChange: ctx.onChange,
        itemLabel: (p, i) => `${i + 1}. ${label(p.a)} ↔ ${label(p.b)}`,
        create: () => ({ id: rid(), a: { text: '', image: '' }, b: { text: '', image: '' } }),
        renderItem: (p, i, changed) => h('div', { class: 'pair-editor' },
          h('div', {}, h('div', { class: 'label' }, 'Shown on the left'), textField('', p.a, 'text', changed, { placeholder: 'Text' }), mediaField('', p.a, 'image', changed, ctx)),
          h('div', {}, h('div', { class: 'label' }, 'Its match (learners drag this)'), textField('', p.b, 'text', changed, { placeholder: 'Text' }), mediaField('', p.b, 'image', changed, ctx))),
      }));
  },

  render(data, ctx) {
    const pairs = (data.pairs || []).filter((p) => (p.a.text?.trim() || p.a.image) && (p.b.text?.trim() || p.b.image));
    if (pairs.length < 2) return emptyState('type-matching', 'Add at least two complete pairs.');
    const root = h('div', { class: 'rs-match' });
    const rows = pairs.map((p) => {
      const slot = h('div', { class: 'rs-match-slot', 'data-drop': p.id, tabindex: '0', 'aria-label': `Match for ${p.a.text || 'item'}` });
      return h('div', { class: 'rs-match-row' }, h('div', { class: 'rs-match-a' }, face(p.a)), h('span', { class: 'rs-match-link', 'aria-hidden': 'true' }), slot);
    });
    const bank = h('div', { class: 'rs-bank', 'data-drop': 'bank', tabindex: '0', 'aria-label': 'Partners' });
    const chips = shuffle(pairs).map((p) => { const el = h('span', { class: 'rs-drag rs-match-b', tabindex: '0', role: 'button' }, face(p.b)); el._id = p.id; return el; });
    bank.append(...chips);
    dragSystem(root, { onDrop: (el, target) => { if (target.classList.contains('rs-match-slot')) { const prev = target.querySelector('.rs-drag'); if (prev && prev !== el) bank.append(prev); } target.append(el); } });
    const actions = actionRow({
      onCheck: () => {
        root.dataset.locked = '1';
        let score = 0;
        chips.forEach((el) => { const slot = el.parentElement; if (!slot.classList.contains('rs-match-slot')) return; const ok = slot.dataset.drop === el._id; el.classList.add(ok ? 'correct' : 'wrong'); if (ok) score++; });
        actions.checked(score, pairs.length); ctx.report?.(score, pairs.length);
      },
      onRetry: () => { delete root.dataset.locked; chips.forEach((el) => { if (el.classList.contains('wrong')) bank.append(el); el.classList.remove('correct', 'wrong'); }); actions.reset(); },
      onShow: () => chips.forEach((el) => { root.querySelector(`.rs-match-slot[data-drop="${CSS.escape(el._id)}"]`).append(el); el.classList.remove('wrong'); el.classList.add('correct'); }),
    });
    root.append(...[!isBlank(data.task) && richBlock(data.task, 'rs-instructions rs-task'), h('div', { class: 'rs-match-rows' }, rows), bank, actions.el].filter(Boolean));
    return root;
  },
};
