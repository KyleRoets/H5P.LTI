import { h, textField, selectField, mediaField, listEditor, optionsEditor, safeUrl, richField, richBlock, isBlank, colorField, choiceQuestion, feedback, emptyState } from '../util.js';
import { icon } from '../icons.js';

const LAYOUTS = [['title', 'Title slide'], ['text', 'Text only'], ['image-right', 'Text + image on the right'], ['image-left', 'Image on the left + text'], ['image-full', 'Full-screen image with caption']];
const blankSlide = () => ({ layout: 'text', title: '', body: '', image: '', bg: '', color: '', question: null });

export default {
  id: 'presentation',
  name: 'Presentation',
  icon: 'type-presentation',
  graded: true,
  tagline: 'Slides with text, images and built-in questions.',
  about: {
    summary: 'A slide deck that lives inside your ReachLMS page. Each slide can have a heading, formatted text and an image in one of five layouts, and any slide can include a quick question. Learners can go full screen.',
    uses: ['Short lessons or explainers (5–15 slides)', 'Step-by-step instructions or processes', 'Revision summaries with check-your-understanding questions', 'Replacing a PowerPoint attachment with something interactive'],
    learners: 'Learners move through the slides with the arrows, dots or their keyboard, answer any questions as they go, and see a score summary at the end.',
    tip: 'One idea per slide works best. Add a question every few slides to keep learners active — questions also count towards the grade when used as an assignment.',
  },
  defaults: () => ({ slides: [blankSlide()] }),
  example: () => ({
    title: 'Introduction to cells',
    data: { slides: [
      { layout: 'title', title: 'Introduction to cells', body: '<p>Unit 1 · Biology</p>', image: '', bg: '#193B82', color: '#FFFFFF', question: null },
      { layout: 'image-right', title: 'What is a cell?', body: '<p>Cells are the <strong>basic building blocks</strong> of all living things.</p><ul><li>The smallest unit of life</li><li>About 37 trillion in your body</li></ul>', image: '/img/examples/cell.png', bg: '', color: '', question: null },
      { layout: 'text', title: 'Quick check', body: '', image: '', bg: '#F4F6FA', color: '', question: { text: '<p>Which part <strong>controls</strong> the cell?</p>', options: [{ text: 'Nucleus', correct: true }, { text: 'Cell wall', correct: false }, { text: 'Vacuole', correct: false }] } },
    ] },
  }),

  editor(data, ctx) {
    return h('div', {}, listEditor({
      items: data.slides, label: 'Slides', addText: 'Add slide', min: 1, onChange: ctx.onChange, startCollapsed: data.slides.length > 3,
      itemLabel: (s, i) => `${i + 1}. ${s.title || 'Untitled slide'}${s.question ? '  ·  question' : ''}`,
      create: blankSlide,
      renderItem: (s, i, changed) => {
        const qHost = h('div');
        const drawQ = () => {
          qHost.replaceChildren();
          if (!s.question) {
            qHost.append(h('button', { class: 'btn sm add-btn', type: 'button', onclick: () => { s.question = { text: '', options: [{ text: '', correct: true }, { text: '', correct: false }] }; changed(); drawQ(); } }, icon('help', { size: 15 }), h('span', {}, 'Add a question to this slide')));
          } else {
            qHost.append(h('div', { class: 'subsection' },
              h('div', { class: 'section-title' }, 'Slide question'),
              richField('Question', s.question, 'text', changed, { compact: true, placeholder: 'Type your question…' }),
              optionsEditor(s.question, changed),
              h('button', { class: 'btn sm danger', type: 'button', onclick: () => { s.question = null; changed(); drawQ(); } }, icon('trash', { size: 15 }), h('span', {}, 'Remove question'))));
          }
        };
        drawQ();
        return h('div', {},
          selectField('Layout', s, 'layout', LAYOUTS, changed),
          textField('Heading', s, 'title', changed, { placeholder: 'Slide heading' }),
          richField('Text', s, 'body', changed, { placeholder: 'Slide text…' }),
          mediaField('Image', s, 'image', changed, ctx),
          h('div', { class: 'field-row' },
            colorField('Slide background', s, 'bg', changed, { allowEmpty: true, swatches: ['#FFFFFF', '#F4F6FA', '#EEF6FF', '#FFF9EC', '#F1FAF4', '#193B82', '#278DDF', '#1D2433'] }),
            colorField('Slide text', s, 'color', changed, { allowEmpty: true, swatches: ['#1D2433', '#193B82', '#FFFFFF'] })),
          qHost);
      },
    }));
  },

  render(data, ctx) {
    const slides = data.slides || [];
    if (!slides.length) return emptyState('type-presentation', 'Add a slide to get started.');
    const questions = slides.filter((s) => s.question && s.question.options?.some((o) => o.correct));
    const results = new Map();
    let idx = 0;
    const stage = h('div', { class: 'rs-stage', 'aria-live': 'polite' });
    const dots = h('div', { class: 'rs-dots' });
    const counter = h('span', { class: 'rs-status' });
    const prev = h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Previous slide', onclick: () => go(idx - 1) }, icon('chevron-left', { size: 16 }), h('span', {}, 'Back'));
    const next = h('button', { class: 'btn sm primary rs-accent-btn', type: 'button', 'aria-label': 'Next slide', onclick: () => go(idx + 1) }, h('span', {}, 'Next'), icon('chevron-right', { size: 16 }));
    const deck = h('div', { class: 'rs-deck', tabindex: '0' });
    const fs = h('button', { class: 'icon-btn', type: 'button', title: 'Full screen', 'aria-label': 'Full screen', onclick: () => (document.fullscreenElement ? document.exitFullscreen() : deck.requestFullscreen?.()) }, icon('maximize', { size: 16 }));
    const total = slides.length + (questions.length ? 1 : 0);

    const drawSlide = () => {
      stage.replaceChildren();
      if (idx === slides.length) {
        const score = [...results.values()].filter(Boolean).length;
        stage.append(h('div', { class: 'rs-slide layout-title' }, h('div', { class: 'content' },
          h('h2', {}, 'Summary'), h('div', { class: 'rs-result' }, h('div', { class: 'big' }, `${score} / ${questions.length}`),
            h('p', {}, results.size < questions.length ? `You answered ${results.size} of ${questions.length} questions.` : 'All questions answered.')))));
        ctx.report?.(score, questions.length);
        return;
      }
      const s = slides[idx];
      const img = safeUrl(s.image);
      const content = h('div', { class: 'content' }, s.title && h('h2', {}, s.title), !isBlank(s.body) && richBlock(s.body));
      if (!s.title && isBlank(s.body) && !img && !s.question) content.append(h('p', { class: 'rs-status' }, 'Empty slide'));
      if (s.question && s.question.options?.some((o) => o.correct)) {
        if (results.has(s)) {
          content.append(h('div', { class: 'slide-q' }, richBlock(s.question.text), feedback(results.get(s), 'You answered this correctly.', 'You answered this incorrectly.')));
        } else {
          const q = choiceQuestion(s.question);
          const fb = h('div');
          const btn = h('button', { class: 'btn sm primary rs-accent-btn', type: 'button', onclick: () => {
            const ok = q.check(); if (ok === null) return;
            results.set(s, ok); btn.remove(); fb.append(feedback(ok)); drawDots();
          } }, icon('check', { size: 15 }), h('span', {}, 'Check'));
          content.append(h('div', { class: 'slide-q' }, q.el, h('div', { class: 'rs-actions' }, btn), fb));
        }
      }
      stage.append(h('div', { class: `rs-slide layout-${s.layout || 'text'}`, style: { background: s.bg || '', color: s.color || '' } },
        content, img && s.layout !== 'text' && s.layout !== 'title' && h('div', { class: 'media' }, h('img', { src: img, alt: '' }))));
    };
    const drawDots = () => {
      dots.replaceChildren(...Array.from({ length: total }, (_, i) => h('button', {
        type: 'button', 'aria-label': `Go to slide ${i + 1}`, class: `${i === idx ? 'active' : ''} ${slides[i] && results.has(slides[i]) ? 'answered' : ''}`, onclick: () => go(i) })));
      counter.textContent = `${idx + 1} / ${total}`;
      prev.disabled = idx === 0; next.disabled = idx === total - 1;
    };
    const go = (i) => { idx = Math.max(0, Math.min(total - 1, i)); drawSlide(); drawDots(); };
    deck.addEventListener('keydown', (e) => { if (e.target.closest('input,textarea')) return; if (e.key === 'ArrowRight') go(idx + 1); if (e.key === 'ArrowLeft') go(idx - 1); });
    deck.append(stage, h('div', { class: 'rs-deck-nav' }, prev, dots, counter, fs, next));
    go(0);
    return deck;
  },
};
