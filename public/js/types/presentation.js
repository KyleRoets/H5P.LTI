import { h, textField, selectField, mediaField, listEditor, optionsEditor, safeUrl, formatText, choiceQuestion, feedback } from '../util.js';

const LAYOUTS = [['title', 'Title slide'], ['text', 'Text only'], ['image-right', 'Text + image right'], ['image-left', 'Image left + text'], ['image-full', 'Full image with caption']];
const newSlide = (n) => ({ layout: 'text', title: `Slide ${n}`, body: '', image: '', bg: '#ffffff', color: '#1d2433', question: null });

export default {
  id: 'presentation',
  name: 'Presentation',
  description: 'Slides with text, images and built-in questions, with full-screen mode.',
  icon: '🖥️',
  color: '#1971c2',
  graded: true,
  defaults: () => ({
    slides: [
      { layout: 'title', title: 'Welcome', body: 'Use the arrows to move through the slides.', image: '', bg: '#1b2a4a', color: '#ffffff', question: null },
      newSlide(2),
    ],
  }),

  editor(data, ctx) {
    return h('div', {}, listEditor({
      items: data.slides, label: 'Slides', addText: 'Slide', min: 1, onChange: ctx.onChange, startCollapsed: data.slides.length > 3,
      itemLabel: (s, i) => `${i + 1}. ${s.title || 'Untitled slide'}${s.question ? ' · ❓' : ''}`,
      create: () => newSlide(data.slides.length + 1),
      renderItem: (s, i, changed) => {
        const qHost = h('div');
        const drawQ = () => {
          qHost.replaceChildren();
          if (!s.question) {
            qHost.append(h('button', { class: 'btn sm', type: 'button', onclick: () => { s.question = { text: '', options: [{ text: '', correct: true }, { text: '', correct: false }] }; changed(); drawQ(); } }, '+ Add a question to this slide'));
          } else {
            qHost.append(h('div', { class: 'section-title' }, 'Slide question'),
              textField('Question', s.question, 'text', changed),
              optionsEditor(s.question, changed),
              h('button', { class: 'btn sm danger', type: 'button', onclick: () => { s.question = null; changed(); drawQ(); } }, 'Remove question'));
          }
        };
        drawQ();
        return h('div', {},
          selectField('Layout', s, 'layout', LAYOUTS, changed),
          textField('Heading', s, 'title', changed),
          textField('Text', s, 'body', changed, { multiline: true, rows: 4, help: 'Blank line = new paragraph. Supports **bold**, _italic_, [links](https://…).' }),
          mediaField('Image', s, 'image', changed, ctx),
          h('div', { class: 'field-row' },
            h('div', { class: 'field' }, h('label', {}, 'Background', h('input', { type: 'color', value: s.bg || '#ffffff', oninput: (e) => { s.bg = e.target.value; changed(); } }))),
            h('div', { class: 'field' }, h('label', {}, 'Text colour', h('input', { type: 'color', value: s.color || '#1d2433', oninput: (e) => { s.color = e.target.value; changed(); } })))),
          qHost);
      },
    }));
  },

  render(data, ctx) {
    const slides = data.slides || [];
    if (!slides.length) return h('div', { class: 'rs-empty' }, 'Add a slide to get started.');
    const questions = slides.filter((s) => s.question && s.question.options?.some((o) => o.correct));
    const results = new Map();
    let idx = 0;
    const stage = h('div', { class: 'rs-stage', 'aria-live': 'polite' });
    const dots = h('div', { class: 'rs-dots' });
    const counter = h('span', { class: 'rs-status' });
    const prev = h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Previous slide', onclick: () => go(idx - 1) }, '‹ Prev');
    const next = h('button', { class: 'btn sm primary', type: 'button', 'aria-label': 'Next slide', onclick: () => go(idx + 1) }, 'Next ›');
    const deck = h('div', { class: 'rs-deck', tabindex: '0' });
    const fs = h('button', { class: 'btn sm ghost', type: 'button', title: 'Full screen', 'aria-label': 'Full screen', onclick: () => (document.fullscreenElement ? document.exitFullscreen() : deck.requestFullscreen?.()) }, '⛶');
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
      const content = h('div', { class: 'content' }, s.title && h('h2', {}, s.title), s.body && h('div', { class: 'rs-text', html: formatText(s.body) }));
      if (s.question && s.question.options?.some((o) => o.correct)) {
        if (results.has(s)) {
          content.append(h('div', { style: { marginTop: '10px' } },
            h('div', { class: 'rs-question-text', html: formatText(s.question.text) }),
            feedback(results.get(s), 'You answered this correctly.', 'You answered this incorrectly.')));
        } else {
          const q = choiceQuestion(s.question);
          const fb = h('div');
          const btn = h('button', { class: 'btn sm primary', type: 'button', onclick: () => {
            const ok = q.check(); if (ok === null) return;
            results.set(s, ok); btn.remove(); fb.append(feedback(ok)); drawDots();
          } }, 'Check');
          content.append(h('div', { style: { marginTop: '10px' } }, q.el, h('div', { class: 'rs-actions' }, btn), fb));
        }
      }
      stage.append(h('div', { class: `rs-slide layout-${s.layout || 'text'}`, style: { background: s.bg || '#fff', color: s.color || 'inherit' } },
        content, img && s.layout !== 'text' && h('div', { class: 'media' }, h('img', { src: img, alt: '' }))));
    };
    const drawDots = () => {
      dots.replaceChildren(...Array.from({ length: total }, (_, i) => h('button', {
        type: 'button', 'aria-label': `Go to slide ${i + 1}`, class: `${i === idx ? 'active' : ''} ${slides[i] && results.has(slides[i]) ? 'answered' : ''}`, onclick: () => go(i) })));
      counter.textContent = `${idx + 1} / ${total}`;
      prev.disabled = idx === 0; next.disabled = idx === total - 1;
    };
    const go = (i) => { idx = Math.max(0, Math.min(total - 1, i)); drawSlide(); drawDots(); };
    deck.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(idx + 1); if (e.key === 'ArrowLeft') go(idx - 1); });
    deck.append(stage, h('div', { class: 'rs-deck-nav' }, prev, dots, counter, fs, next));
    go(0);
    return deck;
  },
};
