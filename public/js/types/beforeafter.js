import { h, textField, mediaField, safeUrl, segmentField, richField, richBlock, isBlank, emptyState } from '../util.js';
import { icon } from '../icons.js';

export default {
  id: 'beforeafter',
  name: 'Before and After',
  icon: 'type-beforeafter',
  graded: false,
  category: 'media',
  tagline: 'Drag a slider to compare two images of the same thing.',
  about: {
    summary: 'Places two images on top of each other with a draggable divider, so learners can compare them in detail — before and after, then and now, healthy and diseased, with and without a label.',
    uses: ['Then-and-now photos (places, buildings, landscapes)', 'Before and after a change, treatment or process', 'Comparing two versions of a diagram or design', 'Revealing labels on top of an unlabelled image'],
    learners: 'Learners drag the handle (or use the arrow keys) to reveal more of one image or the other.',
    tip: 'Both images must be the same size and framing, or the comparison won\'t line up.',
  },
  defaults: () => ({ intro: '', before: '', beforeLabel: 'Before', after: '', afterLabel: 'After', start: 50, orientation: 'horizontal' }),
  example: () => ({ title: 'Label the cell', data: { intro: '<p>Drag the handle to reveal the labels.</p>', before: '/img/examples/cell.png', beforeLabel: 'Unlabelled', after: '/img/examples/cell-labelled.png', afterLabel: 'Labelled', start: 50, orientation: 'horizontal' } }),

  editor(data, ctx) {
    return h('div', {},
      richField('Introduction (optional)', data, 'intro', ctx.onChange, { compact: true }),
      h('div', { class: 'pair-editor' },
        h('div', {}, mediaField('First image', data, 'before', ctx.onChange, ctx), textField('Label', data, 'beforeLabel', ctx.onChange)),
        h('div', {}, mediaField('Second image', data, 'after', ctx.onChange, ctx), textField('Label', data, 'afterLabel', ctx.onChange))),
      segmentField('Divider', data, 'orientation', [['horizontal', 'Side by side (drag left/right)'], ['vertical', 'Top and bottom (drag up/down)']], ctx.onChange, { showText: true }),
      textField('Start position (%)', data, 'start', ctx.onChange, { type: 'number', min: 0, max: 100 }));
  },

  render(data) {
    const a = safeUrl(data.before); const b = safeUrl(data.after);
    if (!a || !b) return emptyState('type-beforeafter', 'Add both images to compare.');
    const vert = data.orientation === 'vertical';
    let pos = Math.max(0, Math.min(100, Number(data.start) || 50));
    const top = h('div', { class: 'rs-ba-top' }, h('img', { src: b, alt: data.afterLabel || '' }), data.afterLabel && h('span', { class: 'rs-ba-lbl b' }, data.afterLabel));
    const handle = h('div', { class: 'rs-ba-handle', role: 'slider', tabindex: '0', 'aria-label': 'Comparison position', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { class: 'knob' }, icon(vert ? 'chevron-up' : 'chevron-left', { size: 14 }), icon(vert ? 'chevron-down' : 'chevron-right', { size: 14 })));
    const box = h('div', { class: `rs-ba ${vert ? 'vert' : ''}` }, h('img', { class: 'base', src: a, alt: data.beforeLabel || '' }), data.beforeLabel && h('span', { class: 'rs-ba-lbl a' }, data.beforeLabel), top, handle);
    const set = (p) => {
      pos = Math.max(0, Math.min(100, p));
      top.style.clipPath = vert ? `inset(${pos}% 0 0 0)` : `inset(0 0 0 ${pos}%)`;
      handle.style[vert ? 'top' : 'left'] = `${pos}%`;
      handle.setAttribute('aria-valuenow', String(Math.round(pos)));
    };
    const fromEvent = (e) => { const r = box.getBoundingClientRect(); set(vert ? ((e.clientY - r.top) / r.height) * 100 : ((e.clientX - r.left) / r.width) * 100); };
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault(); fromEvent(e);
      const mv = (ev) => fromEvent(ev);
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    handle.addEventListener('keydown', (e) => { const d = { ArrowLeft: -5, ArrowUp: -5, ArrowRight: 5, ArrowDown: 5 }[e.key]; if (d) { e.preventDefault(); set(pos + d); } });
    set(pos);
    return h('div', {}, !isBlank(data.intro) && richBlock(data.intro, 'rs-instructions'), box);
  },
};
