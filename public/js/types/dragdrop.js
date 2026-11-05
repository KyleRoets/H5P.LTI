import { h, textField, selectField, mediaField, listEditor, safeUrl, shuffle, dragSystem, actionRow } from '../util.js';

const rid = () => Math.random().toString(36).slice(2, 9);

// Editor canvas: drag zones to move, drag the corner to resize.
function zoneCanvas(data, onChange) {
  const canvas = h('div', { class: 'pos-canvas', style: { cursor: 'default' } });
  const draw = () => {
    canvas.replaceChildren(safeUrl(data.image) ? h('img', { src: safeUrl(data.image), alt: '' }) : h('div', { class: 'placeholder' }, 'Optional background image — zones work without one too'));
    data.zones.forEach((z) => {
      const handle = h('span', { class: 'resize' });
      const el = h('div', { class: 'pos-zone', style: { left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` } }, z.label || 'Zone', handle);
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
  description: 'Learners drag labels onto the correct areas of an image or board.',
  icon: '🧩',
  color: '#6741d9',
  graded: true,
  defaults: () => {
    const a = rid(); const b = rid();
    return {
      instructions: 'Drag each label to the correct area.',
      image: '',
      zones: [{ id: a, label: 'Zone A', x: 5, y: 10, w: 40, h: 80 }, { id: b, label: 'Zone B', x: 55, y: 10, w: 40, h: 80 }],
      items: [{ id: rid(), text: 'Item for A', zoneId: a }, { id: rid(), text: 'Item for B', zoneId: b }],
    };
  },

  editor(data, ctx) {
    const zc = zoneCanvas(data, ctx.onChange);
    const itemsHost = h('div');
    const zoneOptions = () => [['', '— No correct zone (distractor) —'], ...data.zones.map((z) => [z.id, z.label || 'Zone'])];
    const drawItems = () => itemsHost.replaceChildren(listEditor({
      items: data.items, label: 'Draggable labels', addText: 'Label', onChange: ctx.onChange,
      itemLabel: (it) => `${it.text || 'Untitled'} → ${data.zones.find((z) => z.id === it.zoneId)?.label || 'distractor'}`,
      create: () => ({ id: rid(), text: '', zoneId: data.zones[0]?.id || '' }),
      renderItem: (it, i, changed) => h('div', {}, textField('Label text', it, 'text', changed), selectField('Correct zone', it, 'zoneId', zoneOptions(), changed)),
    }));
    const change = () => { ctx.onChange(); zc.draw(); };
    const zones = listEditor({
      items: data.zones, label: 'Drop zones', addText: 'Zone', min: 1, onChange: () => { change(); drawItems(); },
      itemLabel: (z) => z.label || 'Zone',
      create: () => ({ id: rid(), label: `Zone ${data.zones.length + 1}`, x: 30, y: 30, w: 25, h: 25 }),
      renderItem: (z, i, changed) => textField('Zone label', z, 'label', () => { changed(); zc.draw(); drawItems(); }, { help: 'Shown on the board. Leave blank to hide.' }),
    });
    drawItems();
    return h('div', {},
      textField('Instructions', data, 'instructions', ctx.onChange),
      mediaField('Background image (optional)', data, 'image', change, ctx),
      h('div', { class: 'field' }, h('label', {}, 'Arrange zones (drag to move, corner to resize)'), zc.canvas),
      zones, itemsHost);
  },

  render(data, ctx) {
    if (!data.items?.length || !data.zones?.length) return h('div', { class: 'rs-empty' }, 'Add zones and labels to get started.');
    const root = h('div', { class: 'rs-dnd' });
    const url = safeUrl(data.image);
    const board = h('div', { class: 'rs-dnd-board' }, url ? h('img', { src: url, alt: '' }) : h('div', { class: 'noimg' }));
    const zoneEls = data.zones.map((z) => {
      const el = h('div', { class: 'rs-zone', 'data-drop': z.id, tabindex: '0', 'aria-label': `Drop zone ${z.label || ''}`, style: { left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` } },
        z.label && h('span', { class: 'zl' }, z.label));
      board.append(el);
      return el;
    });
    const bank = h('div', { class: 'rs-bank', 'data-drop': 'bank', tabindex: '0', 'aria-label': 'Label bank' });
    const items = shuffle(data.items).map((it) => { const el = h('span', { class: 'rs-drag', tabindex: '0', role: 'button' }, it.text); el._it = it; return el; });
    const scorable = data.items.filter((i) => i.zoneId).length;
    const reset = () => { delete root.dataset.locked; items.forEach((el) => { el.classList.remove('correct', 'wrong'); bank.append(el); }); actions.reset(); };
    dragSystem(root, { onDrop: (el, target) => target.append(el) });
    const actions = actionRow({
      onCheck: () => {
        root.dataset.locked = '1';
        let score = 0;
        items.forEach((el) => {
          const zone = el.parentElement?.dataset.drop;
          if (zone === 'bank') { if (!el._it.zoneId) return; el.classList.add('wrong'); return; }
          const ok = zone === el._it.zoneId;
          el.classList.add(ok ? 'correct' : 'wrong');
          if (ok) score++;
          else if (!el._it.zoneId) score = Math.max(0, score - 1);
        });
        actions.checked(score, scorable);
        ctx.report?.(score, scorable);
      },
      onRetry: reset,
      onShow: () => items.forEach((el) => {
        const zi = data.zones.findIndex((z) => z.id === el._it.zoneId);
        el.classList.remove('wrong'); el.classList.add(zi >= 0 ? 'correct' : 'wrong');
        (zi >= 0 ? zoneEls[zi] : bank).append(el);
      }),
    });
    bank.append(...items);
    root.append(data.instructions && h('p', { class: 'rs-instructions' }, data.instructions), board, bank, actions.el);
    return root;
  },
};
