import { h, textField, mediaField, safeUrl, segmentField, emptyState } from '../util.js';
import { icon } from '../icons.js';

// Layouts: grid-template-areas strings; each letter is one cell, in reading order.
export const LAYOUTS = {
  two: { name: 'Two side by side', areas: '"a b"', cells: 2 },
  three: { name: 'Three in a row', areas: '"a b c"', cells: 3 },
  bigLeft: { name: 'One big + two', areas: '"a b" "a c"', cells: 3 },
  bigTop: { name: 'One wide + two', areas: '"a a" "b c"', cells: 3 },
  grid4: { name: 'Grid of four', areas: '"a b" "c d"', cells: 4 },
  bigLeft3: { name: 'One big + three', areas: '"a b" "a c" "a d"', cells: 4 },
  six: { name: 'Grid of six', areas: '"a b c" "d e f"', cells: 6 },
};
const LETTERS = 'abcdef';

export default {
  id: 'collage',
  name: 'Collage',
  icon: 'type-collage',
  graded: false,
  category: 'media',
  tagline: 'Several pictures arranged in a tidy layout.',
  about: {
    summary: 'Pick a layout and drop pictures into its spaces to create a neat collage — great for showing several related images at once without a long column of pictures.',
    uses: ['Visual summaries and mood boards', 'Showing examples side by side', 'Introducing a topic with a set of striking pictures', 'Class or project photo collections'],
    learners: 'Learners see all the pictures at once; clicking a picture opens it larger.',
    tip: 'Pictures are cropped to fill their space, so keep the important part of each image near its centre.',
  },
  defaults: () => ({ layout: 'bigLeft', gap: 'small', height: 'medium', images: Array.from({ length: 6 }, () => ({ image: '', alt: '' })) }),
  example: () => ({ title: 'Cell collage', data: { layout: 'bigLeft', gap: 'small', height: 'medium', images: [{ image: '/img/examples/cell.png', alt: 'Plant cell' }, { image: '/img/examples/cell.png', alt: 'Plant cell' }, { image: '/img/examples/cell.png', alt: 'Plant cell' }, { image: '', alt: '' }, { image: '', alt: '' }, { image: '', alt: '' }] } }),

  editor(data, ctx) {
    while (data.images.length < 6) data.images.push({ image: '', alt: '' });
    const host = h('div');
    const draw = () => {
      const L = LAYOUTS[data.layout] || LAYOUTS.bigLeft;
      host.replaceChildren(h('div', { class: 'section-title' }, 'Pictures'),
        ...data.images.slice(0, L.cells).map((im, i) => h('div', { class: 'list-item' }, h('div', { class: 'list-item-head' }, h('span', { class: 'lbl' }, `Space ${LETTERS[i].toUpperCase()}`)),
          h('div', { class: 'list-item-body' }, mediaField('', im, 'image', ctx.onChange, ctx), textField('Description (for screen readers)', im, 'alt', ctx.onChange)))));
    };
    draw();
    return h('div', {},
      segmentField('Layout', data, 'layout', Object.entries(LAYOUTS).map(([k, v]) => [k, v.name]), () => { ctx.onChange(); draw(); }, { showText: true }),
      h('div', { class: 'field-row' },
        segmentField('Spacing', data, 'gap', [['none', 'None'], ['small', 'Small'], ['large', 'Large']], ctx.onChange, { showText: true }),
        segmentField('Height', data, 'height', [['short', 'Short'], ['medium', 'Medium'], ['tall', 'Tall']], ctx.onChange, { showText: true })),
      host);
  },

  render(data) {
    const L = LAYOUTS[data.layout] || LAYOUTS.bigLeft;
    const imgs = (data.images || []).slice(0, L.cells);
    if (!imgs.some((i) => safeUrl(i.image))) return emptyState('type-collage', 'Add pictures to the layout.');
    const rows = L.areas.match(/"/g).length / 2;
    const cols = L.areas.split('"')[1].trim().split(/\s+/).length;
    const hgt = { short: 300, medium: 420, tall: 560 }[data.height] || 420;
    const grid = h('div', { class: 'rs-collage', style: { gridTemplateAreas: L.areas, gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, gap: { none: '0', small: '6px', large: '14px' }[data.gap] || '6px', aspectRatio: `${cols * 4 * 420} / ${rows * 3 * hgt}` } },
      imgs.map((im, i) => (safeUrl(im.image)
        ? h('button', { type: 'button', class: 'rs-collage-cell', style: { gridArea: LETTERS[i] }, 'aria-label': im.alt ? `Open: ${im.alt}` : 'Open picture', onclick: () => zoom(im) }, h('img', { src: safeUrl(im.image), alt: im.alt || '' }))
        : h('span', { class: 'rs-collage-cell empty', style: { gridArea: LETTERS[i] } }))));
    const root = h('div', { class: 'rs-collage-wrap' }, grid);
    function zoom(im) {
      const lb = h('div', { class: 'rs-lightbox', role: 'dialog', 'aria-label': im.alt || 'Picture', onclick: () => lb.remove() }, h('img', { src: safeUrl(im.image), alt: im.alt || '' }), h('button', { class: 'icon-btn close', type: 'button', 'aria-label': 'Close' }, icon('x', { size: 20 })));
      lb.addEventListener('keydown', (e) => { if (e.key === 'Escape') lb.remove(); });
      root.append(lb); lb.querySelector('button').focus();
    }
    return root;
  },
};
