import { h, textField, mediaField, listEditor, safeUrl, segmentField, checkField, emptyState } from '../util.js';
import { icon } from '../icons.js';

export default {
  id: 'slider',
  name: 'Image Slider',
  icon: 'type-slider',
  graded: false,
  category: 'media',
  tagline: 'A swipeable gallery of images with captions.',
  about: {
    summary: 'A simple, clean carousel of pictures. Each slide has an image, alternative text for screen readers and an optional caption. Learners swipe, click the arrows or use the keyboard.',
    uses: ['Photo galleries from a trip, experiment or event', 'Step-by-step picture instructions', 'Showing examples of work', 'Comparing a set of images one at a time'],
    learners: 'Learners click the arrows or dots, swipe on touch screens, or use the arrow keys to move between images.',
    tip: 'Use images with the same shape so the slider doesn\'t jump in height, and always fill in the description for accessibility.',
  },
  defaults: () => ({ ratio: '16/9', autoplay: false, slides: [{ image: '', alt: '', caption: '' }, { image: '', alt: '', caption: '' }] }),
  example: () => ({ title: 'Cells gallery', data: { ratio: '16/9', autoplay: false, slides: [
    { image: '/img/examples/cell.png', alt: 'A plant cell diagram', caption: 'A plant cell, with its nucleus in the middle.' },
    { image: '/img/examples/cell.png', alt: 'The same diagram again', caption: 'Look for the two mitochondria (orange).' },
  ] } }),

  editor(data, ctx) {
    return h('div', {},
      listEditor({
        items: data.slides, label: 'Slides', addText: 'Add slide', min: 1, onChange: ctx.onChange,
        itemLabel: (s, i) => `${i + 1}. ${s.caption || s.alt || (s.image ? 'Image' : 'Empty slide')}`,
        create: () => ({ image: '', alt: '', caption: '' }),
        renderItem: (s, i, changed) => h('div', {}, mediaField('Image', s, 'image', changed, ctx), textField('Description (for screen readers)', s, 'alt', changed), textField('Caption (optional)', s, 'caption', changed)),
      }),
      h('div', { class: 'section-title' }, 'Settings'),
      segmentField('Shape', data, 'ratio', [['16/9', 'Wide 16:9'], ['4/3', 'Standard 4:3'], ['1/1', 'Square']], ctx.onChange, { showText: true }),
      checkField('Move to the next slide automatically every 5 seconds', data, 'autoplay', ctx.onChange));
  },

  render(data) {
    const slides = (data.slides || []).filter((s) => safeUrl(s.image));
    if (!slides.length) return emptyState('type-slider', 'Add an image to get started.');
    let idx = 0; let timer;
    const strip = h('div', { class: 'rs-slider-strip' }, slides.map((s) => h('figure', { class: 'rs-slide-fig' }, h('img', { src: safeUrl(s.image), alt: s.alt || '' }), s.caption && h('figcaption', {}, s.caption))));
    const dots = h('div', { class: 'rs-dots' });
    const go = (i) => {
      idx = (i + slides.length) % slides.length;
      strip.style.transform = `translateX(-${idx * 100}%)`;
      dots.replaceChildren(...slides.map((_, j) => h('button', { type: 'button', class: j === idx ? 'active' : '', 'aria-label': `Slide ${j + 1}`, onclick: () => go(j) })));
    };
    const root = h('div', { class: 'rs-slider', tabindex: '0', 'aria-roledescription': 'carousel', onkeydown: (e) => { if (e.key === 'ArrowRight') go(idx + 1); if (e.key === 'ArrowLeft') go(idx - 1); } },
      h('div', { class: 'rs-slider-view', style: { aspectRatio: data.ratio || '16/9' } }, strip,
        slides.length > 1 && h('button', { class: 'rs-slider-arrow left', type: 'button', 'aria-label': 'Previous', onclick: () => go(idx - 1) }, icon('chevron-left', { size: 22 })),
        slides.length > 1 && h('button', { class: 'rs-slider-arrow right', type: 'button', 'aria-label': 'Next', onclick: () => go(idx + 1) }, icon('chevron-right', { size: 22 }))),
      slides.length > 1 && dots);
    let sx = null;
    root.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) sx = e.clientX; });
    root.addEventListener('pointerup', (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 40) go(idx + (e.clientX < sx ? 1 : -1)); sx = null; });
    if (data.autoplay && slides.length > 1) {
      timer = setInterval(() => { if (!root.isConnected) return clearInterval(timer); if (!root.matches(':hover')) go(idx + 1); }, 5000);
    }
    go(0);
    return root;
  },
};
