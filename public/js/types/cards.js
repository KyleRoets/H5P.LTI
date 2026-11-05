import { h, textField, mediaField, listEditor, safeUrl, formatText, checkField, shuffle } from '../util.js';

export default {
  id: 'cards',
  name: 'Flashcards',
  description: 'Two-sided cards that flip to reveal answers — great for revision.',
  icon: '🃏',
  color: '#5c940d',
  graded: false,
  defaults: () => ({
    shuffle: false,
    cards: [{ front: 'Photosynthesis', back: 'How plants turn light, water and CO₂ into food.', image: '' }, { front: 'Mitochondria', back: 'The powerhouse of the cell.', image: '' }],
  }),

  editor(data, ctx) {
    return h('div', {},
      checkField('Shuffle the cards each time', data, 'shuffle', ctx.onChange),
      listEditor({
        items: data.cards, label: 'Cards', addText: 'Card', min: 1, onChange: ctx.onChange, startCollapsed: data.cards.length > 4,
        itemLabel: (c, i) => `${i + 1}. ${c.front || 'Untitled card'}`,
        create: () => ({ front: '', back: '', image: '' }),
        renderItem: (c, i, changed) => h('div', {},
          textField('Front', c, 'front', changed, { multiline: true, rows: 2 }),
          textField('Back', c, 'back', changed, { multiline: true, rows: 2 }),
          mediaField('Image on front (optional)', c, 'image', changed, ctx)),
      }));
  },

  render(data) {
    const cards = data.shuffle ? shuffle(data.cards || []) : (data.cards || []);
    if (!cards.length) return h('div', { class: 'rs-empty' }, 'Add a card to get started.');
    let idx = 0;
    const host = h('div', { style: { width: '100%', display: 'flex', justifyContent: 'center' } });
    const counter = h('span', { class: 'rs-status' });
    const prev = h('button', { class: 'btn sm', type: 'button', onclick: () => go(idx - 1) }, '‹ Previous');
    const next = h('button', { class: 'btn sm primary', type: 'button', onclick: () => go(idx + 1) }, 'Next ›');
    const go = (i) => {
      idx = Math.max(0, Math.min(cards.length - 1, i));
      const c = cards[idx];
      const flip = () => { card.classList.toggle('flipped'); card.setAttribute('aria-pressed', String(card.classList.contains('flipped'))); };
      // A div with role=button: <button> elements don't size reliably with aspect-ratio + 3D children.
      const card = h('div', { class: 'rs-flip', role: 'button', tabindex: '0', 'aria-pressed': 'false', 'aria-label': 'Flip card', onclick: flip,
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } } },
        h('div', { class: 'rs-flip-inner' },
          h('div', { class: 'rs-face front' }, safeUrl(c.image) && h('img', { src: safeUrl(c.image), alt: '' }), h('div', { class: 'rs-text', html: formatText(c.front) }), h('span', { class: 'hint' }, 'Click to flip')),
          h('div', { class: 'rs-face back' }, h('div', { class: 'rs-text', html: formatText(c.back) }), h('span', { class: 'hint' }, 'Click to flip back'))));
      host.replaceChildren(card);
      counter.textContent = `${idx + 1} / ${cards.length}`;
      prev.disabled = idx === 0; next.disabled = idx === cards.length - 1;
    };
    go(0);
    return h('div', { class: 'rs-cards' }, host, h('div', { class: 'rs-cards-nav' }, prev, counter, next));
  },
};
