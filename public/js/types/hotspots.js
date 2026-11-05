import { h, textField, mediaField, listEditor, safeUrl, richField, richBlock, isBlank, colorField, segmentField, checkField, selectField, emptyState, rid } from '../util.js';
import { icon } from '../icons.js';

export const MARKERS = [
  ['number', 'Numbers'], ['plus', 'Plus'], ['info', 'Info'], ['question', 'Question'],
  ['star', 'Star'], ['pin', 'Pin'], ['eye', 'Eye'], ['dot', 'Dot'],
];
const SIZES = { sm: 26, md: 34, lg: 44 };

/** The content shown inside a marker. */
function markerGlyph(kind, n) {
  if (kind === 'number') return h('span', { class: 'glyph-text' }, String(n));
  if (kind === 'info') return h('span', { class: 'glyph-text serif' }, 'i');
  if (kind === 'question') return h('span', { class: 'glyph-text' }, '?');
  return icon(kind === 'dot' ? 'dot' : kind, { size: 16, stroke: 2.6 });
}
function markerEl(tag, data, hs, i, extra = {}) {
  const m = data.marker || {};
  const kind = hs.icon || m.icon || 'number';
  const size = SIZES[m.size] || SIZES.md;
  return h(tag, {
    ...extra,
    class: `rs-hotspot ${extra.class || ''} ${m.pulse === false ? 'no-pulse' : ''} shape-${m.shape || 'circle'}`,
    style: { left: `${hs.x}%`, top: `${hs.y}%`, '--hs-color': hs.color || m.color || 'var(--rs-accent)', '--hs-size': `${size}px` },
  }, markerGlyph(kind, i + 1));
}

// Editor canvas: click to add a hotspot, drag a marker to move it.
function markerCanvas(data, onChange, redrawList) {
  const canvas = h('div', { class: 'pos-canvas hotspot-canvas rs-themed' });
  const draw = () => {
    canvas.replaceChildren();
    const url = safeUrl(data.image);
    canvas.append(url ? h('img', { src: url, alt: '' }) : h('div', { class: 'placeholder' }, icon('image', { size: 28 }), h('span', {}, 'Upload a background image above')));
    data.hotspots.forEach((hs, i) => {
      const m = markerEl('div', data, hs, i, { class: 'editor-marker', title: hs.title || `Hotspot ${i + 1}` });
      m.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        const r = canvas.getBoundingClientRect();
        const move = (ev) => {
          hs.x = Math.round(Math.min(100, Math.max(0, ((ev.clientX - r.left) / r.width) * 100)) * 10) / 10;
          hs.y = Math.round(Math.min(100, Math.max(0, ((ev.clientY - r.top) / r.height) * 100)) * 10) / 10;
          m.style.left = `${hs.x}%`; m.style.top = `${hs.y}%`;
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onChange(); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      });
      canvas.append(m);
    });
  };
  canvas.addEventListener('click', (e) => {
    if (!data.image || e.target.closest('.rs-hotspot')) return;
    const r = canvas.getBoundingClientRect();
    data.hotspots.push({ id: rid(), x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10, title: '', body: '', image: '', icon: '', color: '' });
    onChange(); draw(); redrawList();
  });
  draw();
  return { canvas, draw };
}

export default {
  id: 'hotspots',
  name: 'Image Hotspots',
  icon: 'type-hotspots',
  graded: false,
  tagline: 'Clickable markers on an image that reveal text and pictures.',
  about: {
    summary: 'Image Hotspots turns any picture into something learners explore. You place markers on the image; when a learner clicks one, a small card opens with your explanation, and it can include an image of its own.',
    uses: ['Label a diagram (a cell, an engine, a map, a painting)', 'A virtual tour of a place or a piece of equipment', 'Point out details in a photo, chart or screenshot', 'Introduce people or characters in an image'],
    learners: 'Learners click (or tap) the numbered markers in any order. Visited markers change colour so they can see what they still need to explore.',
    tip: 'Use a large, clear image and keep each card short — a sentence or two and, if useful, a close-up picture.',
  },
  defaults: () => ({ image: '', instructions: '', marker: { icon: 'number', color: '', size: 'md', pulse: true, shape: 'circle' }, popover: 'light', hotspots: [] }),
  example: () => ({
    title: 'Parts of a cell',
    data: {
      image: '/img/examples/cell.png', instructions: '<p>Click each marker to explore the parts of a plant cell.</p>',
      marker: { icon: 'number', color: '', size: 'md', pulse: true, shape: 'circle' }, popover: 'light',
      hotspots: [
        { id: 'a', x: 52, y: 51, title: 'Nucleus', body: '<p>The <strong>control centre</strong> of the cell. It holds the DNA — the instructions for everything the cell does.</p>', image: '', icon: '', color: '' },
        { id: 'b', x: 31, y: 36, title: 'Mitochondrion', body: '<p>Releases energy from food through <em>respiration</em>. Busy cells have lots of them.</p>', image: '', icon: '', color: '' },
        { id: 'c', x: 84, y: 50, title: 'Cell wall', body: '<p>A tough outer layer that gives plant cells their shape. <span style="color: rgb(31, 157, 106);">Animal cells don\'t have one.</span></p>', image: '', icon: '', color: '' },
      ],
    },
  }),

  editor(data, ctx) {
    data.marker ||= { icon: 'number', color: '', size: 'md', pulse: true, shape: 'circle' };
    const listHost = h('div');
    let mc;
    const change = () => { ctx.onChange(); mc?.draw(); };
    const drawList = () => listHost.replaceChildren(listEditor({
      items: data.hotspots, label: 'Hotspots', addText: 'Add hotspot', onChange: change,
      empty: 'Click on the image above to place your first hotspot.',
      itemLabel: (it, i) => `${i + 1}. ${it.title || 'Untitled hotspot'}`,
      create: () => ({ id: rid(), x: 50, y: 50, title: '', body: '', image: '', icon: '', color: '' }),
      renderItem: (it, i, changed) => h('div', {},
        textField('Title', it, 'title', changed, { placeholder: 'e.g. Nucleus' }),
        richField('Text', it, 'body', changed, { placeholder: 'What should learners read when they open this hotspot?' }),
        mediaField('Picture in the card (optional)', it, 'image', changed, ctx),
        h('details', { class: 'more' }, h('summary', {}, 'Marker for this hotspot'),
          selectField('Icon', it, 'icon', [['', 'Same as all markers'], ...MARKERS], () => { changed(); mc.draw(); }),
          colorField('Colour', it, 'color', () => { changed(); mc.draw(); }, { allowEmpty: true }),
          h('div', { class: 'field-row' },
            textField('Across (%)', it, 'x', () => { changed(); mc.draw(); }, { type: 'number', min: 0, max: 100 }),
            textField('Down (%)', it, 'y', () => { changed(); mc.draw(); }, { type: 'number', min: 0, max: 100 })))),
    }));
    mc = markerCanvas(data, ctx.onChange, drawList);
    drawList();
    const m = data.marker;
    return h('div', {},
      mediaField('Background image', data, 'image', () => { ctx.onChange(); mc.draw(); }, ctx),
      richField('Instructions (optional)', data, 'instructions', ctx.onChange, { compact: true, placeholder: 'e.g. Click each marker to explore the diagram.' }),
      h('div', { class: 'field' }, h('div', { class: 'label' }, 'Place hotspots ', h('span', { class: 'hint' }, '— click the image to add, drag to move')), mc.canvas),
      h('div', { class: 'section-title' }, 'Marker style'),
      segmentField('Icon', m, 'icon', MARKERS.map(([v, t]) => [v, t, { number: '', info: 'info', question: 'help', plus: 'plus', star: 'star', pin: 'pin', eye: 'eye', dot: 'dot' }[v] || undefined]), () => { ctx.onChange(); mc.draw(); }, { showText: true }),
      h('div', { class: 'field-row' },
        segmentField('Size', m, 'size', [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']], () => { ctx.onChange(); mc.draw(); }, { showText: true }),
        segmentField('Shape', m, 'shape', [['circle', 'Circle'], ['square', 'Square']], () => { ctx.onChange(); mc.draw(); }, { showText: true })),
      colorField('Marker colour', m, 'color', () => { ctx.onChange(); mc.draw(); }, { allowEmpty: true }),
      h('div', { class: 'field-row' },
        checkField('Pulse to attract attention', m, 'pulse', () => { ctx.onChange(); mc.draw(); }),
        segmentField('Card style', data, 'popover', [['light', 'Light'], ['dark', 'Dark']], ctx.onChange, { showText: true })),
      listHost);
  },

  render(data) {
    const url = safeUrl(data.image);
    if (!url) return emptyState('image', 'Add a background image to get started.');
    const board = h('div', { class: 'rs-hotspots' }, h('img', { class: 'bg', src: url, alt: data.alt || '' }));
    let pop = null;
    const close = () => { pop?.remove(); pop = null; };
    data.hotspots.forEach((hs, i) => {
      const b = markerEl('button', data, hs, i, { type: 'button', 'aria-label': hs.title || `Hotspot ${i + 1}`,
        onclick: (e) => {
          e.stopPropagation(); close(); b.classList.add('seen');
          pop = h('div', { class: `rs-popover ${data.popover === 'dark' ? 'dark' : ''}`, role: 'dialog', 'aria-label': hs.title || `Hotspot ${i + 1}` },
            h('button', { class: 'icon-btn close', type: 'button', 'aria-label': 'Close', onclick: close }, icon('x', { size: 16 })),
            hs.title && h('h4', {}, hs.title),
            safeUrl(hs.image) && h('img', { src: safeUrl(hs.image), alt: '' }),
            !isBlank(hs.body) && richBlock(hs.body));
          board.append(pop);
          // Place the card beside the marker, kept fully inside the image.
          const bw = board.clientWidth; const bh = board.clientHeight;
          const pw = pop.offsetWidth; const ph = pop.offsetHeight;
          const px = (hs.x / 100) * bw; const py = (hs.y / 100) * bh;
          let left = px + 28 + pw <= bw - 8 ? px + 28 : px - 28 - pw;
          left = Math.max(8, Math.min(left, bw - pw - 8));
          const top = Math.max(8, Math.min(py - ph / 2, bh - ph - 8));
          pop.style.left = `${left}px`; pop.style.top = `${top}px`;
          pop.querySelector('.close').focus();
        } }, i);
      board.append(b);
    });
    board.addEventListener('click', (e) => { if (!e.target.closest('.rs-popover')) close(); });
    board.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    return h('div', {}, !isBlank(data.instructions) && richBlock(data.instructions, 'rs-instructions'), board);
  },
};
