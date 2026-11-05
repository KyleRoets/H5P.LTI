import { h, textField, selectField, mediaField, listEditor, safeUrl, shuffle, dragSystem, actionRow, richField, richBlock, isBlank, colorField, checkField, emptyState, rid } from '../util.js';
import { icon } from '../icons.js';

// Editor canvas: drag zones to move, drag the corner to resize.
function zoneCanvas(data, onChange) {
  const canvas = h('div', { class: 'pos-canvas zone-canvas' });
  const draw = () => {
    canvas.replaceChildren(safeUrl(data.image) ? h('img', { src: safeUrl(data.image), alt: '' }) : h('div', { class: 'placeholder' }, icon('type-dragdrop', { size: 26 }), h('span', {}, data.zones.length ? 'No background image — zones sit on a plain board' : 'Add drop zones below, then drag them into place')));
    data.zones.forEach((z, i) => {
      const handle = h('span', { class: 'resize', title: 'Drag to resize' });
      const el = h('div', { class: 'pos-zone', style: { left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%`, '--zone-color': z.color || data.zoneColor || '#193B82' } }, h('span', { class: 'zl' }, z.label || `Zone ${i + 1}`), handle);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        const resizing = e.target === handle;
        const sx = e.clientX; const sy = e.clientY; const o = { ...z };
        const move = (ev) => {
          const dx = ((ev.clientX - sx) / r.width) * 100; const dy = ((ev.clientY - sy) / r.height) * 100;
          if (resizing) { z.w = Math.max(5, Math.min(100 - z.x, o.w + dx)); z.h = Math.max(5, Math.min(100 - z.y, o.h + dy)); }
          else { z.x = Math.max(0, Math.min(100 - z.w, o.x + dx)); z.y = Math.max(0, Math.min(100 - z.h, o.y + dy)); }
          Object.assign(el.style, { left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` });
        };
        const up = () => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
          ['x', 'y', 'w', 'h'].forEach((k) => { z[k] = Math.round(z[k] * 10) / 10; }); onChange();
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      });
      canvas.append(el);
    });
  };
  draw();
  return { canvas, draw };
}

export default {
  id: 'dragdrop',
  name: 'Drag and Drop',
  icon: 'type-dragdrop',
  graded: true,
  tagline: 'Drag labels onto the right areas of an image or board.',
  about: {
    summary: 'Learners drag labels (words or short phrases) onto drop zones you draw — on top of a picture, or on a plain board for sorting tasks. You decide which zone each label belongs to, and can add "distractor" labels that belong nowhere.',
    uses: ['Label a diagram, map or photo', 'Sort items into categories (e.g. mammals / reptiles, needs / wants)', 'Match terms to definitions or causes to effects', 'Put steps of a process in the right place'],
    learners: 'Learners drag each label into a zone (or tap a label, then tap a zone). Pressing Check marks each label right or wrong; they can try again or reveal the answers.',
    tip: 'Make zones a little bigger than the labels, and add one or two distractors so learners have to think rather than guess by elimination.',
  },
  defaults: () => ({ instructions: '', image: '', zoneColor: '', showZoneLabels: true, zones: [], items: [] }),
  example: () => ({
    title: 'Label the cell',
    data: { instructions: '<p>Drag each label onto the right part of the cell.</p>', image: '/img/examples/cell.png', zoneColor: '', showZoneLabels: false,
      zones: [{ id: 'z1', label: 'Nucleus', x: 44, y: 38, w: 17, h: 26 }, { id: 'z2', label: 'Mitochondrion', x: 22, y: 27, w: 17, h: 18 }],
      items: [{ id: 'i1', text: 'Nucleus', zoneId: 'z1' }, { id: 'i2', text: 'Mitochondrion', zoneId: 'z2' }, { id: 'i3', text: 'Gills', zoneId: '' }] },
  }),

  editor(data, ctx) {
    const zc = zoneCanvas(data, ctx.onChange);
    const itemsHost = h('div');
    const zoneOptions = () => [['', 'None (a distractor)'], ...data.zones.map((z, i) => [z.id, z.label || `Zone ${i + 1}`])];
    const drawItems = () => itemsHost.replaceChildren(listEditor({
      items: data.items, label: 'Labels to drag', addText: 'Add label', onChange: ctx.onChange,
      empty: 'Add the labels learners will drag into the zones.',
      itemLabel: (it) => `${it.text || 'Untitled'} → ${data.zones.find((z) => z.id === it.zoneId)?.label || (it.zoneId ? 'zone' : 'distractor')}`,
      create: () => ({ id: rid(), text: '', zoneId: data.zones[0]?.id || '' }),
      renderItem: (it, i, changed) => h('div', {}, textField('Label text', it, 'text', changed, { placeholder: 'e.g. Nucleus' }), selectField('Belongs in', it, 'zoneId', zoneOptions(), changed)),
    }));
    const change = () => { ctx.onChange(); zc.draw(); };
    const zones = listEditor({
      items: data.zones, label: 'Drop zones', addText: 'Add zone', onChange: () => { change(); drawItems(); },
      empty: 'Add a zone, then drag it into place on the board above.',
      itemLabel: (z, i) => z.label || `Zone ${i + 1}`,
      create: () => ({ id: rid(), label: '', x: 35, y: 30, w: 25, h: 30, color: '' }),
      renderItem: (z, i, changed) => h('div', {},
        textField('Zone name', z, 'label', () => { changed(); zc.draw(); drawItems(); }, { placeholder: `Zone ${i + 1}` }),
        colorField('Zone colour', z, 'color', () => { changed(); zc.draw(); }, { allowEmpty: true })),
    });
    drawItems();
    return h('div', {},
      richField('Instructions (optional)', data, 'instructions', ctx.onChange, { compact: true, placeholder: 'e.g. Drag each label to the correct area.' }),
      mediaField('Background image (optional)', data, 'image', change, ctx),
      h('div', { class: 'field' }, h('div', { class: 'label' }, 'Board ', h('span', { class: 'hint' }, '— drag zones to move them, drag the corner to resize')), zc.canvas),
      zones, itemsHost,
      h('div', { class: 'section-title' }, 'Board style'),
      checkField('Show zone names to learners', data, 'showZoneLabels', ctx.onChange),
      colorField('Zone colour (all zones)', data, 'zoneColor', change, { allowEmpty: true }));
  },

  render(data, ctx) {
    if (!data.items?.length || !data.zones?.length) return emptyState('type-dragdrop', 'Add drop zones and labels to get started.');
    const root = h('div', { class: 'rs-dnd' });
    const url = safeUrl(data.image);
    const board = h('div', { class: 'rs-dnd-board' }, url ? h('img', { src: url, alt: '' }) : h('div', { class: 'noimg' }));
    const zoneEls = data.zones.map((z) => {
      const el = h('div', { class: 'rs-zone', 'data-drop': z.id, tabindex: '0', 'aria-label': `Drop zone ${z.label || ''}`, style: { left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%`, '--zone-color': z.color || data.zoneColor || 'var(--rs-accent)' } },
        data.showZoneLabels !== false && z.label && h('span', { class: 'zl' }, z.label));
      board.append(el);
      return el;
    });
    const bank = h('div', { class: 'rs-bank', 'data-drop': 'bank', tabindex: '0', 'aria-label': 'Labels' });
    const items = shuffle(data.items.filter((i) => i.text?.trim())).map((it) => { const el = h('span', { class: 'rs-drag', tabindex: '0', role: 'button' }, it.text); el._it = it; return el; });
    const scorable = data.items.filter((i) => i.zoneId && i.text?.trim()).length;
    const ds = dragSystem(root, { onDrop: (el, target) => target.append(el) });
    const reset = () => { delete root.dataset.locked; ds.animate(() => items.forEach((el) => { el.classList.remove('correct', 'wrong'); bank.append(el); })); actions.reset(); };
    const actions = actionRow({
      onCheck: () => {
        root.dataset.locked = '1';
        let score = 0;
        items.forEach((el) => {
          const zone = el.parentElement?.dataset.drop;
          if (zone === 'bank') { if (el._it.zoneId) el.classList.add('wrong'); return; }
          const ok = zone === el._it.zoneId;
          el.classList.add(ok ? 'correct' : 'wrong');
          if (ok) score++;
          else if (!el._it.zoneId) score = Math.max(0, score - 1);
        });
        actions.checked(score, scorable);
        ctx.report?.(score, scorable);
      },
      onRetry: reset,
      onShow: () => ds.animate(() => items.forEach((el) => {
        const zi = data.zones.findIndex((z) => z.id === el._it.zoneId);
        el.classList.remove('wrong'); el.classList.add(zi >= 0 ? 'correct' : 'wrong');
        (zi >= 0 ? zoneEls[zi] : bank).append(el);
      })),
    });
    bank.append(...items);
    root.append(...[!isBlank(data.instructions) && richBlock(data.instructions, 'rs-instructions'), board, bank, actions.el].filter(Boolean));
    return root;
  },
};
