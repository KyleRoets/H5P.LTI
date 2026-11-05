import { h, textField, mediaField, listEditor, safeUrl, formatText } from '../util.js';

// Positionable marker canvas shared by the editor: click to add, drag to move.
function markerCanvas(data, onChange, redrawList) {
  const canvas = h('div', { class: 'pos-canvas', title: 'Click the image to add a hotspot. Drag a hotspot to move it.' });
  const draw = () => {
    canvas.replaceChildren();
    const url = safeUrl(data.image);
    canvas.append(url ? h('img', { src: url, alt: '' }) : h('div', { class: 'placeholder' }, 'Upload a background image above'));
    data.hotspots.forEach((hs, i) => {
      const m = h('div', { class: 'pos-marker', style: { left: `${hs.x}%`, top: `${hs.y}%` } }, String(i + 1));
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
    if (!data.image || e.target.closest('.pos-marker')) return;
    const r = canvas.getBoundingClientRect();
    data.hotspots.push({ x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10, title: `Hotspot ${data.hotspots.length + 1}`, body: '', image: '' });
    onChange(); draw(); redrawList();
  });
  draw();
  return { canvas, draw };
}

export default {
  id: 'hotspots',
  name: 'Image Hotspots',
  description: 'Add clickable points to an image that reveal text and pictures.',
  icon: '📍',
  color: '#e8590c',
  graded: false,
  defaults: () => ({ image: '', instructions: 'Click the markers to explore the image.', hotspots: [] }),

  editor(data, ctx) {
    const listHost = h('div');
    let mc;
    const change = () => { ctx.onChange(); mc?.draw(); };
    const drawList = () => listHost.replaceChildren(listEditor({
      items: data.hotspots, label: 'Hotspots', addText: 'Hotspot', onChange: change,
      itemLabel: (it, i) => `${i + 1}. ${it.title || 'Untitled'}`,
      create: () => ({ x: 50, y: 50, title: `Hotspot ${data.hotspots.length + 1}`, body: '', image: '' }),
      renderItem: (it, i, changed) => h('div', {},
        textField('Title', it, 'title', changed),
        textField('Text', it, 'body', changed, { multiline: true, help: 'Supports **bold**, _italic_ and [links](https://…).' }),
        mediaField('Image (optional)', it, 'image', changed, ctx),
        h('div', { class: 'field-row' },
          textField('X position (%)', it, 'x', () => { changed(); mc.draw(); }, { type: 'number' }),
          textField('Y position (%)', it, 'y', () => { changed(); mc.draw(); }, { type: 'number' }))),
    }));
    mc = markerCanvas(data, ctx.onChange, drawList);
    drawList();
    return h('div', {},
      mediaField('Background image', data, 'image', () => { ctx.onChange(); mc.draw(); }, ctx),
      textField('Instructions', data, 'instructions', ctx.onChange),
      h('div', { class: 'field' }, h('label', {}, 'Place hotspots (click the image)'), mc.canvas),
      listHost);
  },

  render(data) {
    const url = safeUrl(data.image);
    if (!url) return h('div', { class: 'rs-empty' }, 'Add a background image to get started.');
    const board = h('div', { class: 'rs-hotspots' }, h('img', { class: 'bg', src: url, alt: data.alt || '' }));
    let pop = null;
    const close = () => { pop?.remove(); pop = null; };
    data.hotspots.forEach((hs, i) => {
      const b = h('button', { class: 'rs-hotspot', type: 'button', 'aria-label': hs.title || `Hotspot ${i + 1}`, style: { left: `${hs.x}%`, top: `${hs.y}%` },
        onclick: (e) => {
          e.stopPropagation(); close(); b.classList.add('seen');
          pop = h('div', { class: 'rs-popover', role: 'dialog', 'aria-label': hs.title },
            h('button', { class: 'icon-btn close', type: 'button', 'aria-label': 'Close', onclick: close }, '✕'),
            hs.title && h('h4', {}, hs.title),
            safeUrl(hs.image) && h('img', { src: safeUrl(hs.image), alt: '' }),
            h('div', { class: 'rs-text', html: formatText(hs.body) }));
          board.append(pop);
          // Place the popover beside the hotspot, kept fully inside the image.
          const bw = board.clientWidth; const bh = board.clientHeight;
          const pw = pop.offsetWidth; const ph = pop.offsetHeight;
          const px = (hs.x / 100) * bw; const py = (hs.y / 100) * bh;
          let left = px + 26 + pw <= bw - 8 ? px + 26 : px - 26 - pw;
          left = Math.max(8, Math.min(left, bw - pw - 8));
          const top = Math.max(8, Math.min(py - ph / 2, bh - ph - 8));
          pop.style.left = `${left}px`; pop.style.top = `${top}px`;
          pop.querySelector('.close').focus();
        } }, String(i + 1));
      board.append(b);
    });
    board.addEventListener('click', (e) => { if (!e.target.closest('.rs-popover')) close(); });
    board.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    return h('div', {}, data.instructions && h('p', { class: 'rs-instructions' }, data.instructions), board);
  },
};
