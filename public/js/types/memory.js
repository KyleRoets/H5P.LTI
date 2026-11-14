import { h, textField, mediaField, listEditor, safeUrl, richField, richBlock, isBlank, colorField, emptyState, shuffle } from '../util.js';
import { icon } from '../icons.js';

export default {
  id: 'memory',
  name: 'Memory Game',
  icon: 'type-memory',
  graded: false,
  category: 'games',
  tagline: 'Flip cards two at a time to find the matching pairs.',
  about: {
    summary: 'The classic pairs game. Each pair can be two identical cards, or two different cards that belong together (a picture and its name, a word and its translation). Learners flip two cards at a time to find all the pairs.',
    uses: ['Vocabulary and picture–word recognition', 'Matching related concepts in a playful way', 'Warm-ups and brain breaks', 'Younger learners and language learning'],
    learners: 'Learners click a card to flip it, then another. If they match, they stay face up; if not, they flip back. A move counter and timer show how they did.',
    tip: '6–10 pairs is plenty. Use different matching cards (picture ↔ word) to make it about learning, not just memory.',
  },
  defaults: () => ({ intro: '', back: '#193B82', pairs: [{ image: '', text: '', matchImage: '', matchText: '' }, { image: '', text: '', matchImage: '', matchText: '' }] }),
  example: () => ({
    title: 'Cell parts memory',
    data: { intro: '<p>Match each part of the cell with its job.</p>', back: '#193B82', pairs: [
      { image: '', text: 'Nucleus', matchImage: '', matchText: 'Control centre' },
      { image: '', text: 'Mitochondrion', matchImage: '', matchText: 'Releases energy' },
      { image: '', text: 'Chloroplast', matchImage: '', matchText: 'Makes food' },
      { image: '/img/examples/cell.png', text: '', matchImage: '', matchText: 'Plant cell' },
    ] },
  }),

  editor(data, ctx) {
    return h('div', {},
      richField('Instructions (optional)', data, 'intro', ctx.onChange, { compact: true }),
      listEditor({
        items: data.pairs, label: 'Pairs', addText: 'Add pair', min: 2, onChange: ctx.onChange,
        itemLabel: (p, i) => `${i + 1}. ${p.text || (p.image ? 'Image' : 'Untitled')}${p.matchText || p.matchImage ? ` ↔ ${p.matchText || 'Image'}` : ''}`,
        create: () => ({ image: '', text: '', matchImage: '', matchText: '' }),
        renderItem: (p, i, changed) => h('div', { class: 'pair-editor' },
          h('div', {}, h('div', { class: 'label' }, 'Card'), mediaField('', p, 'image', changed, ctx), textField('', p, 'text', changed, { placeholder: 'Text (optional)' })),
          h('div', {}, h('div', { class: 'label' }, 'Matching card ', h('span', { class: 'hint' }, '(leave empty for an identical card)')), mediaField('', p, 'matchImage', changed, ctx), textField('', p, 'matchText', changed, { placeholder: 'Text (optional)' }))),
      }),
      colorField('Card back colour', data, 'back', ctx.onChange));
  },

  render(data) {
    const pairs = (data.pairs || []).filter((p) => p.image || p.text?.trim());
    if (pairs.length < 2) return emptyState('type-memory', 'Add at least two pairs.');
    const root = h('div', { class: 'rs-memory' });
    const play = () => {
      const deck = shuffle(pairs.flatMap((p, i) => {
        const twin = p.matchImage || p.matchText?.trim();
        return [{ pair: i, image: p.image, text: p.text }, { pair: i, image: twin ? p.matchImage : p.image, text: twin ? p.matchText : p.text }];
      }));
      let open = []; let moves = 0; let found = 0; const t0 = Date.now(); let busy = false;
      const status = h('div', { class: 'rs-memory-status' }, h('span', { class: 'moves' }, 'Moves: 0'), h('span', { class: 'found' }, `Pairs: 0 / ${pairs.length}`));
      const cols = deck.length <= 8 ? 4 : deck.length <= 12 ? 4 : deck.length <= 16 ? 4 : deck.length <= 20 ? 5 : 6;
      const grid = h('div', { class: 'rs-memory-grid', style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } }, deck.map((c, n) => {
        const card = h('button', { class: 'rs-mem-card', type: 'button', 'aria-label': `Card ${n + 1}`, style: { '--back': data.back || '#193B82' } },
          h('span', { class: 'inner' },
            h('span', { class: 'face back' }, icon('help', { size: 26 })),
            h('span', { class: 'face front' }, safeUrl(c.image) && h('img', { src: safeUrl(c.image), alt: '' }), c.text && h('span', { class: 't' }, c.text))));
        card.addEventListener('click', () => {
          if (busy || card.classList.contains('up')) return;
          card.classList.add('up'); card.setAttribute('aria-label', c.text || 'Picture card');
          open.push({ card, c });
          if (open.length === 2) {
            moves++; status.querySelector('.moves').textContent = `Moves: ${moves}`;
            const [a, b] = open; open = [];
            if (a.c.pair === b.c.pair) {
              a.card.classList.add('matched'); b.card.classList.add('matched'); found++;
              status.querySelector('.found').textContent = `Pairs: ${found} / ${pairs.length}`;
              if (found === pairs.length) setTimeout(() => done(moves, Math.round((Date.now() - t0) / 1000)), 500);
            } else {
              busy = true;
              setTimeout(() => { a.card.classList.remove('up'); b.card.classList.remove('up'); busy = false; }, 900);
            }
          }
        });
        return card;
      }));
      root.replaceChildren(...[!isBlank(data.intro) && richBlock(data.intro, 'rs-instructions'), status, grid].filter(Boolean));
    };
    const done = (moves, secs) => root.replaceChildren(h('div', { class: 'rs-result' }, h('div', { class: 'result-badge pass' }, icon('award', { size: 28 })),
      h('div', { class: 'big' }, 'Well done!'), h('p', {}, `All ${pairs.length} pairs found in ${moves} moves and ${secs} seconds.`),
      h('button', { class: 'btn', type: 'button', onclick: play }, icon('restore', { size: 16 }), h('span', {}, 'Play again'))));
    play();
    return root;
  },
};
