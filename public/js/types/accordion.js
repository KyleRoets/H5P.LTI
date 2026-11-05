import { h, textField, listEditor, richField, richBlock, checkField, colorField, emptyState } from '../util.js';
import { icon } from '../icons.js';

export default {
  id: 'accordion',
  name: 'Accordion',
  icon: 'type-accordion',
  graded: false,
  tagline: 'Expandable sections that keep long text tidy.',
  about: {
    summary: 'A stack of headings that open to reveal their content. It lets you put a lot of information on a page without overwhelming learners — they open only the parts they need.',
    uses: ['Frequently asked questions', 'Glossaries and key terms', 'Step-by-step instructions, one step per section', 'Optional extra detail or "read more" content'],
    learners: 'Learners click a heading to open it and click again to close it. Sections can be opened in any order.',
    tip: 'Write headings that make sense on their own (e.g. as questions), so learners can find what they need without opening everything.',
  },
  defaults: () => ({ openFirst: false, single: false, headerBg: '', headerText: '', panels: [{ title: '', body: '' }] }),
  example: () => ({
    title: 'Cell FAQ',
    data: { openFirst: true, single: false, headerBg: '', headerText: '', panels: [
      { title: 'What is a cell?', body: '<p>The smallest unit of life. Every living thing is made of one or more cells.</p>' },
      { title: 'Do all cells have a nucleus?', body: '<p>No — bacteria <strong>do not</strong> have a nucleus. Their DNA floats freely in the cell.</p>' },
      { title: 'How big are cells?', body: '<ul><li>Most are 10–100 micrometres across</li><li>You need a microscope to see them</li></ul>' },
    ] },
  }),

  editor(data, ctx) {
    return h('div', {},
      listEditor({
        items: data.panels, label: 'Sections', addText: 'Add section', min: 1, onChange: ctx.onChange,
        itemLabel: (p, i) => `${i + 1}. ${p.title || 'Untitled section'}`,
        create: () => ({ title: '', body: '' }),
        renderItem: (p, i, changed) => h('div', {},
          textField('Heading', p, 'title', changed, { placeholder: 'e.g. What is a cell?' }),
          richField('Content', p, 'body', changed, { placeholder: 'What learners see when they open this section.' })),
      }),
      h('div', { class: 'section-title' }, 'Accordion settings'),
      checkField('Open the first section by default', data, 'openFirst', ctx.onChange),
      checkField('Only one section open at a time', data, 'single', ctx.onChange),
      h('div', { class: 'field-row' },
        colorField('Heading background', data, 'headerBg', ctx.onChange, { allowEmpty: true }),
        colorField('Heading text', data, 'headerText', ctx.onChange, { allowEmpty: true, swatches: ['#1D2433', '#193B82', '#FFFFFF'] })));
  },

  render(data) {
    const panels = (data.panels || []).filter((p) => p.title?.trim() || p.body);
    if (!panels.length) return emptyState('type-accordion', 'Add a section to get started.');
    const root = h('div', { class: 'rs-accordion' }, panels.map((p, i) => h('details', { open: data.openFirst && i === 0 },
      h('summary', { style: { background: data.headerBg || '', color: data.headerText || '' } }, h('span', {}, p.title || `Section ${i + 1}`), h('span', { class: 'chev' }, icon('chevron-down', { size: 18 }))),
      richBlock(p.body, 'panel'))));
    if (data.single) root.addEventListener('toggle', (e) => { if (e.target.open) root.querySelectorAll('details[open]').forEach((d) => { if (d !== e.target) d.open = false; }); }, true);
    return root;
  },
};
