import { h, textField, listEditor, segmentField, checkField, colorField, richField, richBlock, isBlank, emptyState } from '../util.js';

const PALETTE = ['#278DDF', '#1F9D6A', '#E0702E', '#6C4EE0', '#D23B6B', '#D9940C', '#0E8AA0', '#47587A', '#4E9A2E', '#B8326E'];
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); kids.flat().forEach((k) => k && el.append(k)); return el; };
const fmt = (n) => (Math.abs(n) >= 1000 ? n.toLocaleString() : String(Math.round(n * 100) / 100));

export default {
  id: 'chart',
  name: 'Chart',
  icon: 'type-chart',
  graded: false,
  category: 'media',
  tagline: 'Turn a small table of numbers into a bar, pie or doughnut chart.',
  about: {
    summary: 'Type in labels and values and ReachStudio draws a clean, accessible chart — bar, horizontal bar, pie or doughnut — in your colours. The numbers are also available as a table for screen readers.',
    uses: ['Results of a class survey or experiment', 'Statistics to discuss or interpret', 'Proportions and percentages (pie/doughnut)', 'Comparing quantities in any subject'],
    learners: 'Learners see the chart with values; hovering (or tapping) a bar or slice highlights it. A "Show data" button reveals the table.',
    tip: 'Pie and doughnut charts work best with 2–6 parts of a whole. Use bars to compare separate quantities.',
  },
  defaults: () => ({ title: '', caption: '', kind: 'bar', unit: '', showValues: true, rows: [{ label: '', value: 0, color: '' }, { label: '', value: 0, color: '' }] }),
  example: () => ({ title: 'What cells are made of', data: { title: 'What a typical cell is made of', caption: '<p>Approximate % of a cell\'s mass.</p>', kind: 'doughnut', unit: '%', showValues: true, rows: [
    { label: 'Water', value: 70, color: '' }, { label: 'Proteins', value: 15, color: '' }, { label: 'Fats', value: 7, color: '' }, { label: 'Carbohydrates', value: 4, color: '' }, { label: 'Other', value: 4, color: '' },
  ] } }),

  editor(data, ctx) {
    return h('div', {},
      textField('Chart title', data, 'title', ctx.onChange),
      segmentField('Chart type', data, 'kind', [['bar', 'Bars'], ['hbar', 'Horizontal bars'], ['pie', 'Pie'], ['doughnut', 'Doughnut']], ctx.onChange, { showText: true }),
      listEditor({
        items: data.rows, label: 'Data', addText: 'Add row', min: 1, onChange: ctx.onChange,
        itemLabel: (r, i) => `${r.label || `Row ${i + 1}`}: ${r.value}`,
        create: () => ({ label: '', value: 0, color: '' }),
        renderItem: (r, i, changed) => h('div', {}, h('div', { class: 'field-row' }, textField('Label', r, 'label', changed), textField('Value', r, 'value', changed, { type: 'number', step: 'any' })), colorField('Colour', r, 'color', changed, { allowEmpty: true, swatches: PALETTE })),
      }),
      h('div', { class: 'field-row' }, textField('Unit (optional)', data, 'unit', ctx.onChange, { placeholder: 'e.g. %, kg, people' }), checkField('Show values on the chart', data, 'showValues', ctx.onChange)),
      richField('Caption (optional)', data, 'caption', ctx.onChange, { compact: true }));
  },

  render(data) {
    const rows = (data.rows || []).filter((r) => r.label?.trim() && Number.isFinite(Number(r.value)));
    if (!rows.length) return emptyState('type-chart', 'Add some labels and values.');
    const color = (r, i) => r.color || PALETTE[i % PALETTE.length];
    const unit = data.unit || '';
    const vals = rows.map((r) => Number(r.value));
    const W = 640; const H = 360;
    let chart;
    if (data.kind === 'pie' || data.kind === 'doughnut') {
      const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
      const cx = 180; const cy = 180; const R = 160; const r0 = data.kind === 'doughnut' ? 90 : 0;
      let a0 = -Math.PI / 2;
      const slices = rows.map((r, i) => {
        const frac = Math.max(0, vals[i]) / total; const a1 = a0 + frac * Math.PI * 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = (rad, ang) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`;
        const d = frac >= 0.9999 ? `M ${p(R, 0)} A ${R} ${R} 0 1 1 ${p(R, Math.PI)} A ${R} ${R} 0 1 1 ${p(R, 0)} ${r0 ? `M ${p(r0, 0)} A ${r0} ${r0} 0 1 0 ${p(r0, Math.PI)} A ${r0} ${r0} 0 1 0 ${p(r0, 0)}` : ''}`
          : `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} ${r0 ? `L ${p(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a0)}` : `L ${cx} ${cy}`} Z`;
        const mid = (a0 + a1) / 2; a0 = a1;
        const lr = r0 ? (R + r0) / 2 : R * 0.62;
        return svg('g', { class: 'rs-ch-part', tabindex: '0' }, svg('title', {}, `${r.label}: ${fmt(vals[i])}${unit}`),
          svg('path', { d, fill: color(r, i), 'fill-rule': 'evenodd', stroke: '#fff', 'stroke-width': 2 }),
          data.showValues !== false && frac > 0.05 && svg('text', { x: cx + lr * Math.cos(mid), y: cy + lr * Math.sin(mid) + 5, 'text-anchor': 'middle', class: 'rs-ch-val in' }, `${fmt(vals[i])}${unit}`));
      });
      const legend = rows.map((r, i) => svg('g', { transform: `translate(380 ${40 + i * 30})` }, svg('rect', { width: 16, height: 16, rx: 4, fill: color(r, i) }), svg('text', { x: 26, y: 13, class: 'rs-ch-lbl' }, `${r.label} (${Math.round((Math.max(0, vals[i]) / total) * 100)}%)`)));
      chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': data.title || 'Chart' }, slices, legend);
    } else {
      const max = Math.max(0, ...vals); const min = Math.min(0, ...vals); const span = (max - min) || 1;
      const horizontal = data.kind === 'hbar';
      const pad = horizontal ? { l: 150, r: 60, t: 16, b: 24 } : { l: 52, r: 16, t: 24, b: 56 };
      const pw = W - pad.l - pad.r; const ph = H - pad.t - pad.b;
      const n = rows.length; const band = (horizontal ? ph : pw) / n; const bw = band * 0.62;
      const scale = (v) => ((v - min) / span) * (horizontal ? pw : ph);
      const zero = scale(0);
      const ticks = Array.from({ length: 5 }, (_, i) => min + (span * i) / 4);
      const grid = ticks.map((t) => (horizontal
        ? svg('g', {}, svg('line', { x1: pad.l + scale(t), x2: pad.l + scale(t), y1: pad.t, y2: pad.t + ph, class: 'rs-ch-grid' }), svg('text', { x: pad.l + scale(t), y: H - 6, 'text-anchor': 'middle', class: 'rs-ch-axis' }, fmt(t)))
        : svg('g', {}, svg('line', { x1: pad.l, x2: pad.l + pw, y1: pad.t + ph - scale(t), y2: pad.t + ph - scale(t), class: 'rs-ch-grid' }), svg('text', { x: pad.l - 8, y: pad.t + ph - scale(t) + 4, 'text-anchor': 'end', class: 'rs-ch-axis' }, fmt(t)))));
      const bars = rows.map((r, i) => {
        const v = vals[i]; const len = Math.abs(scale(v) - zero);
        const g = svg('g', { class: 'rs-ch-part', tabindex: '0' }, svg('title', {}, `${r.label}: ${fmt(v)}${unit}`));
        if (horizontal) {
          const y = pad.t + band * i + (band - bw) / 2; const x = pad.l + Math.min(zero, scale(v));
          g.append(svg('rect', { x, y, width: Math.max(1, len), height: bw, rx: 5, fill: color(r, i) }), svg('text', { x: pad.l - 8, y: y + bw / 2 + 5, 'text-anchor': 'end', class: 'rs-ch-lbl' }, r.label));
          if (data.showValues !== false) g.append(svg('text', { x: x + len + 6, y: y + bw / 2 + 5, class: 'rs-ch-val' }, `${fmt(v)}${unit}`));
        } else {
          const x = pad.l + band * i + (band - bw) / 2; const y = pad.t + ph - Math.max(zero, scale(v));
          g.append(svg('rect', { x, y, width: bw, height: Math.max(1, len), rx: 5, fill: color(r, i) }), svg('text', { x: x + bw / 2, y: H - pad.b + 20, 'text-anchor': 'middle', class: 'rs-ch-lbl' }, r.label.length > 14 ? `${r.label.slice(0, 13)}…` : r.label));
          if (data.showValues !== false) g.append(svg('text', { x: x + bw / 2, y: y - 6, 'text-anchor': 'middle', class: 'rs-ch-val' }, `${fmt(v)}${unit}`));
        }
        return g;
      });
      chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': data.title || 'Chart' }, grid, bars);
    }
    const table = h('table', { class: 'rs-ch-table hidden' }, h('thead', {}, h('tr', {}, h('th', {}, 'Label'), h('th', {}, `Value${unit ? ` (${unit})` : ''}`))), h('tbody', {}, rows.map((r, i) => h('tr', {}, h('td', {}, r.label), h('td', {}, fmt(vals[i]))))));
    const toggle = h('button', { class: 'btn sm', type: 'button', onclick: () => { table.classList.toggle('hidden'); toggle.textContent = table.classList.contains('hidden') ? 'Show data' : 'Hide data'; } }, 'Show data');
    return h('figure', { class: 'rs-chart' }, data.title && h('figcaption', { class: 'rs-ch-title' }, data.title), chart, !isBlank(data.caption) && richBlock(data.caption, 'rs-ch-caption'), h('div', { class: 'rs-actions' }, toggle), table);
  },
};
