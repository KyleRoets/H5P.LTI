import { h, textField, mediaField, listEditor, safeUrl, richField, richBlock, isBlank, emptyState } from '../util.js';
import { icon } from '../icons.js';

export default {
  id: 'timeline',
  name: 'Timeline',
  icon: 'type-timeline',
  graded: false,
  category: 'stories',
  tagline: 'Events along a line — dates, stories and pictures in order.',
  about: {
    summary: 'Show events in sequence along a timeline. Each event has a date or label, a title, formatted text and an optional picture. Learners move along the line to explore each event.',
    uses: ['History topics and biographies', 'Stages of a process or life cycle', 'Project milestones or the history of an idea', 'A course or term overview'],
    learners: 'Learners click a point on the timeline (or use Next and Back, or the arrow keys) to read about each event.',
    tip: 'Use short labels for dates ("1665", "Week 3", "Stage 2") and keep each event to a few sentences with one picture.',
  },
  defaults: () => ({ title: '', events: [{ date: '', title: '', html: '', image: '' }, { date: '', title: '', html: '', image: '' }] }),
  example: () => ({
    title: 'Discovering the cell',
    data: { title: 'Discovering the cell', events: [
      { date: '1665', title: 'Robert Hooke names "cells"', html: '<p>Looking at cork under a microscope, Hooke saw tiny boxes and called them <em>cells</em>.</p>', image: '' },
      { date: '1674', title: 'Leeuwenhoek sees living cells', html: '<p>With his own powerful lenses, Antonie van Leeuwenhoek saw bacteria and other living cells.</p>', image: '' },
      { date: '1831', title: 'The nucleus is described', html: '<p>Robert Brown described the <strong>nucleus</strong> in plant cells.</p>', image: '/img/examples/cell.png' },
      { date: '1839', title: 'Cell theory', html: '<p>Schleiden and Schwann proposed that all living things are made of cells.</p>', image: '' },
    ] },
  }),

  editor(data, ctx) {
    return h('div', {},
      textField('Timeline title (optional)', data, 'title', ctx.onChange),
      listEditor({
        items: data.events, label: 'Events (in order)', addText: 'Add event', min: 1, onChange: ctx.onChange,
        itemLabel: (e, i) => `${e.date || '—'} · ${e.title || 'Untitled event'}`,
        create: () => ({ date: '', title: '', html: '', image: '' }),
        renderItem: (e, i, changed) => h('div', {},
          h('div', { class: 'field-row' }, textField('Date or label', e, 'date', changed, { placeholder: 'e.g. 1665' }), textField('Title', e, 'title', changed)),
          richField('Text', e, 'html', changed, { compact: true }),
          mediaField('Picture (optional)', e, 'image', changed, ctx)),
      }));
  },

  render(data) {
    const events = (data.events || []).filter((e) => e.title?.trim() || e.date?.trim());
    if (!events.length) return emptyState('type-timeline', 'Add an event to get started.');
    let idx = 0;
    const card = h('div', { class: 'rs-tl-card', 'aria-live': 'polite' });
    const track = h('div', { class: 'rs-tl-track', role: 'tablist' });
    const prev = h('button', { class: 'icon-btn rs-tl-arrow', type: 'button', 'aria-label': 'Previous event', onclick: () => go(idx - 1) }, icon('chevron-left', { size: 20 }));
    const next = h('button', { class: 'icon-btn rs-tl-arrow', type: 'button', 'aria-label': 'Next event', onclick: () => go(idx + 1) }, icon('chevron-right', { size: 20 }));
    const go = (i) => {
      idx = Math.max(0, Math.min(events.length - 1, i));
      const e = events[idx];
      track.replaceChildren(...events.map((ev, j) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(j === idx), class: `rs-tl-pt ${j === idx ? 'on' : ''} ${j < idx ? 'past' : ''}`, onclick: () => go(j) }, h('span', { class: 'dot' }), h('span', { class: 'lbl' }, ev.date || ev.title))));
      card.replaceChildren(h('div', { class: 'rs-tl-date' }, e.date), h('h3', {}, e.title), safeUrl(e.image) && h('img', { src: safeUrl(e.image), alt: '' }), !isBlank(e.html) && richBlock(e.html));
      prev.disabled = idx === 0; next.disabled = idx === events.length - 1;
      const sc = track.parentElement; const pt = track.children[idx];
      if (sc && pt) sc.scrollTo({ left: pt.offsetLeft - sc.clientWidth / 2 + pt.offsetWidth / 2, behavior: 'smooth' }); // only scroll the track, never the page
    };
    const root = h('div', { class: 'rs-tl', tabindex: '0', onkeydown: (e) => { if (e.key === 'ArrowRight') go(idx + 1); if (e.key === 'ArrowLeft') go(idx - 1); } },
      data.title && h('h3', { class: 'rs-tl-title' }, data.title), h('div', { class: 'rs-tl-line' }, prev, h('div', { class: 'rs-tl-scroll' }, track), next), card);
    go(0);
    return root;
  },
};
