import { h, mediaField, listEditor, safeUrl, richField, richBlock, isBlank, checkField, colorField, shuffle, emptyState , htmlToText } from '../util.js';
import { icon } from '../icons.js';

const plain = htmlToText;

export default {
  id: 'cards',
  name: 'Flashcards',
  icon: 'type-cards',
  graded: false,
  tagline: 'Two-sided cards that flip to reveal the answer.',
  about: {
    summary: 'A deck of cards with a prompt on the front and the answer on the back. Learners flip each card to check themselves, then move to the next. Fronts can include a picture.',
    uses: ['Revising vocabulary, definitions or formulas', 'Language learning (word ↔ translation)', 'Recognising images (a picture on the front, the name on the back)', 'Quick self-checks before a test'],
    learners: 'Learners click or tap a card to flip it, then use Next and Back to move through the deck. It isn\'t graded — it\'s for practice.',
    tip: 'Keep the front short (one word or question) and the back focused. Turn on "Shuffle" so learners don\'t just memorise the order.',
  },
  defaults: () => ({ shuffle: false, frontBg: '', frontText: '', backBg: '', backText: '', cards: [{ front: '', back: '', image: '' }] }),
  example: () => ({
    title: 'Organelle flashcards',
    data: { shuffle: false, frontBg: '', frontText: '', backBg: '', backText: '', cards: [
      { front: '<p><strong>Mitochondrion</strong></p>', back: '<p>Releases energy from food through respiration.</p>', image: '/img/examples/cell.png' },
      { front: '<p><strong>Ribosome</strong></p>', back: '<p>Makes proteins.</p>', image: '' },
      { front: '<p><strong>Cell wall</strong></p>', back: '<p>Supports and protects plant cells.</p>', image: '' },
    ] },
  }),

  editor(data, ctx) {
    return h('div', {},
      listEditor({
        items: data.cards, label: 'Cards', addText: 'Add card', min: 1, onChange: ctx.onChange, startCollapsed: data.cards.length > 4,
        itemLabel: (c, i) => `${i + 1}. ${plain(c.front) || 'Untitled card'}`,
        create: () => ({ front: '', back: '', image: '' }),
        renderItem: (c, i, changed) => h('div', {},
          richField('Front', c, 'front', changed, { compact: true, placeholder: 'Word, question or prompt' }),
          richField('Back', c, 'back', changed, { compact: true, placeholder: 'Answer or explanation' }),
          mediaField('Picture on the front (optional)', c, 'image', changed, ctx)),
      }),
      h('div', { class: 'section-title' }, 'Card colours'),
      h('div', { class: 'field-row' },
        colorField('Front background', data, 'frontBg', ctx.onChange, { allowEmpty: true }),
        colorField('Front text', data, 'frontText', ctx.onChange, { allowEmpty: true, swatches: ['#1D2433', '#193B82', '#FFFFFF'] })),
      h('div', { class: 'field-row' },
        colorField('Back background', data, 'backBg', ctx.onChange, { allowEmpty: true }),
        colorField('Back text', data, 'backText', ctx.onChange, { allowEmpty: true, swatches: ['#FFFFFF', '#1D2433', '#193B82'] })),
      checkField('Shuffle the cards each time', data, 'shuffle', ctx.onChange));
  },

  render(data) {
    const all = (data.cards || []).filter((c) => !isBlank(c.front) || !isBlank(c.back) || c.image);
    if (!all.length) return emptyState('type-cards', 'Add a card to get started.');
    const cards = data.shuffle ? shuffle(all) : all;
    let idx = 0;
    const host = h('div', { class: 'rs-flip-host' });
    const counter = h('span', { class: 'rs-status' });
    const prev = h('button', { class: 'btn sm', type: 'button', onclick: () => go(idx - 1) }, icon('chevron-left', { size: 16 }), h('span', {}, 'Back'));
    const next = h('button', { class: 'btn sm primary rs-accent-btn', type: 'button', onclick: () => go(idx + 1) }, h('span', {}, 'Next'), icon('chevron-right', { size: 16 }));
    const go = (i) => {
      idx = Math.max(0, Math.min(cards.length - 1, i));
      const c = cards[idx];
      const flip = () => { card.classList.toggle('flipped'); card.setAttribute('aria-pressed', String(card.classList.contains('flipped'))); };
      // A div with role=button: <button> elements don't size reliably with aspect-ratio + 3D children.
      const card = h('div', { class: 'rs-flip', role: 'button', tabindex: '0', 'aria-pressed': 'false', 'aria-label': 'Flip card', onclick: flip,
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } } },
        h('div', { class: 'rs-flip-inner' },
          h('div', { class: 'rs-face front', style: { background: data.frontBg || '', color: data.frontText || '' } }, safeUrl(c.image) && h('img', { src: safeUrl(c.image), alt: '' }), richBlock(c.front), h('span', { class: 'hint' }, icon('restore', { size: 13 }), 'Click to flip')),
          h('div', { class: 'rs-face back', style: { background: data.backBg || '', color: data.backText || '' } }, richBlock(c.back), h('span', { class: 'hint' }, icon('restore', { size: 13 }), 'Click to flip back'))));
      host.replaceChildren(card);
      counter.textContent = `${idx + 1} / ${cards.length}`;
      prev.disabled = idx === 0; next.disabled = idx === cards.length - 1;
    };
    go(0);
    return h('div', { class: 'rs-cards' }, host, h('div', { class: 'rs-cards-nav' }, prev, counter, next));
  },
};
