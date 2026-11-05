import { h, textField, mediaField, listEditor, safeUrl, richField, richBlock, isBlank, segmentField, actionRow, emptyState, rid, shuffle } from '../util.js';
import { icon } from '../icons.js';
import { sortableList } from './_shared.js';

export default {
  id: 'order',
  name: 'Put in Order',
  icon: 'type-order',
  graded: true,
  category: 'questions',
  tagline: 'Learners arrange items — text or pictures — in the right order.',
  about: {
    summary: 'You list items in the correct order; learners see them shuffled and drag them into place. Items can be text (sentences, paragraphs, steps) or images, so it covers both sequencing pictures and sorting paragraphs.',
    uses: ['Steps of a process or procedure', 'Events in chronological order', 'Rebuilding a paragraph or story from shuffled sentences', 'Ranking (smallest to largest, oldest to newest)'],
    learners: 'Learners drag items up and down (or across, for pictures) — or use the arrow buttons and keyboard — then press Check. Each item in the right position earns a point.',
    tip: 'Five to eight items is the sweet spot. Avoid items whose order is genuinely debatable.',
  },
  defaults: () => ({ task: '', layout: 'list', items: [{ id: rid(), text: '', image: '' }, { id: rid(), text: '', image: '' }, { id: rid(), text: '', image: '' }] }),
  example: () => ({
    title: 'How plants make food',
    data: { task: '<p>Put the steps of photosynthesis in order.</p>', layout: 'list', items: [
      { id: 'a', text: 'Roots take in water from the soil', image: '' },
      { id: 'b', text: 'Leaves take in carbon dioxide from the air', image: '' },
      { id: 'c', text: 'Chlorophyll captures energy from sunlight', image: '' },
      { id: 'd', text: 'Glucose (sugar) is made in the leaf', image: '' },
      { id: 'e', text: 'Oxygen is released into the air', image: '' },
    ] },
  }),

  editor(data, ctx) {
    return h('div', {},
      richField('Task', data, 'task', ctx.onChange, { compact: true, placeholder: 'e.g. Put the events in the order they happened.' }),
      segmentField('Show items as', data, 'layout', [['list', 'A list (text)'], ['cards', 'Picture cards']], ctx.onChange, { showText: true }),
      listEditor({
        items: data.items, label: 'Items — in the correct order', addText: 'Add item', min: 2, onChange: ctx.onChange,
        itemLabel: (it, i) => `${i + 1}. ${it.text || (it.image ? 'Image' : 'Untitled')}`,
        create: () => ({ id: rid(), text: '', image: '' }),
        renderItem: (it, i, changed) => h('div', {}, textField('Text', it, 'text', changed, { multiline: data.layout === 'list', rows: 2 }), mediaField('Image (optional)', it, 'image', changed, ctx)),
      }));
  },

  render(data, ctx) {
    const items = (data.items || []).filter((i) => i.text?.trim() || i.image);
    if (items.length < 2) return emptyState('type-order', 'Add at least two items, in the correct order.');
    const cards = data.layout === 'cards';
    let order = shuffle(items);
    if (order.every((it, i) => it === items[i])) order = [...order.slice(1), order[0]];
    const list = h('ol', { class: `rs-sort ${cards ? 'cards' : ''}`, 'aria-label': 'Items to order' }, order.map((it) => h('li', { class: 'rs-sort-item', tabindex: '0', 'data-id': it.id },
      h('span', { class: 'grip', 'aria-hidden': 'true' }, icon('grip', { size: 16 })),
      safeUrl(it.image) && h('img', { src: safeUrl(it.image), alt: it.text || '' }),
      it.text && h('span', { class: 'txt' }, it.text),
      h('span', { class: 'mv' }, h('button', { type: 'button', class: 'icon-btn up', 'aria-label': 'Move earlier' }, icon(cards ? 'chevron-left' : 'chevron-up', { size: 15 })), h('button', { type: 'button', class: 'icon-btn down', 'aria-label': 'Move later' }, icon(cards ? 'chevron-right' : 'chevron-down', { size: 15 }))))));
    sortableList(list);
    const actions = actionRow({
      onCheck: () => {
        list.dataset.locked = '1';
        let score = 0;
        [...list.children].forEach((li, i) => { const ok = li.dataset.id === items[i].id; li.classList.add(ok ? 'correct' : 'wrong'); if (ok) score++; });
        actions.checked(score, items.length); ctx.report?.(score, items.length);
      },
      onRetry: () => { delete list.dataset.locked; [...list.children].forEach((li) => li.classList.remove('correct', 'wrong')); actions.reset(); },
      onShow: () => { items.forEach((it) => { const li = list.querySelector(`[data-id="${CSS.escape(it.id)}"]`); list.append(li); li.classList.remove('wrong'); li.classList.add('correct'); }); },
    });
    return h('div', {}, !isBlank(data.task) && richBlock(data.task, 'rs-instructions rs-task'), list, actions.el);
  },
};
