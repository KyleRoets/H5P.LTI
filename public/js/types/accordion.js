import { h, textField, listEditor, formatText, checkField } from '../util.js';

export default {
  id: 'accordion',
  name: 'Accordion',
  description: 'Expandable sections that keep long text tidy — FAQs, glossaries, steps.',
  icon: '📑',
  color: '#495057',
  graded: false,
  defaults: () => ({
    openFirst: false,
    panels: [{ title: 'What is this?', body: 'Click a heading to expand it.' }, { title: 'Section two', body: 'Add as many sections as you need.' }],
  }),

  editor(data, ctx) {
    return h('div', {},
      checkField('Open the first section by default', data, 'openFirst', ctx.onChange),
      listEditor({
        items: data.panels, label: 'Sections', addText: 'Section', min: 1, onChange: ctx.onChange,
        itemLabel: (p, i) => `${i + 1}. ${p.title || 'Untitled'}`,
        create: () => ({ title: '', body: '' }),
        renderItem: (p, i, changed) => h('div', {},
          textField('Heading', p, 'title', changed),
          textField('Content', p, 'body', changed, { multiline: true, rows: 5, help: 'Blank line = new paragraph. Supports **bold**, _italic_, [links](https://…).' })),
      }));
  },

  render(data) {
    const panels = data.panels || [];
    if (!panels.length) return h('div', { class: 'rs-empty' }, 'Add a section to get started.');
    return h('div', { class: 'rs-accordion' }, panels.map((p, i) => h('details', { open: data.openFirst && i === 0 },
      h('summary', {}, p.title || `Section ${i + 1}`), h('div', { class: 'panel rs-text', html: formatText(p.body) }))));
  },
};
