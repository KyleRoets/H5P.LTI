import { h, textField, listEditor, richField, richBlock, isBlank, actionRow, emptyState } from '../util.js';

const clean = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

/**
 * Lays the words out on a grid, crossing them where letters match. Deterministic: the same
 * words always give the same grid. Returns { cells: Map("r,c" → letter), words: [{...placement}] }.
 */
export function layoutCrossword(entries) {
  const list = entries.map((e, i) => ({ ...e, answer: clean(e.answer), i })).filter((e) => e.answer.length >= 2)
    .sort((a, b) => b.answer.length - a.answer.length || a.i - b.i);
  const cells = new Map();
  const placed = [];
  const key = (r, c) => `${r},${c}`;
  const fits = (w, r, c, dir) => {
    const dr = dir === 'down' ? 1 : 0; const dc = dir === 'across' ? 1 : 0;
    if (cells.has(key(r - dr, c - dc)) || cells.has(key(r + dr * w.length, c + dc * w.length))) return -1;
    let crossings = 0;
    for (let k = 0; k < w.length; k++) {
      const rr = r + dr * k; const cc = c + dc * k;
      const cur = cells.get(key(rr, cc));
      if (cur) { if (cur !== w[k]) return -1; crossings++; continue; }
      // no side-by-side letters next to a new letter (keeps words readable)
      if (cells.has(key(rr + dc, cc + dr)) || cells.has(key(rr - dc, cc - dr))) return -1;
    }
    return crossings;
  };
  const put = (e, r, c, dir) => {
    const dr = dir === 'down' ? 1 : 0; const dc = dir === 'across' ? 1 : 0;
    for (let k = 0; k < e.answer.length; k++) cells.set(key(r + dr * k, c + dc * k), e.answer[k]);
    placed.push({ ...e, r, c, dir });
  };
  for (const e of list) {
    if (!placed.length) { put(e, 0, 0, 'across'); continue; }
    let best = null;
    for (const p of placed) {
      for (let k = 0; k < p.answer.length; k++) {
        const pr = p.r + (p.dir === 'down' ? k : 0); const pc = p.c + (p.dir === 'across' ? k : 0);
        const dir = p.dir === 'across' ? 'down' : 'across';
        for (let j = 0; j < e.answer.length; j++) {
          if (e.answer[j] !== p.answer[k]) continue;
          const r = dir === 'down' ? pr - j : pr; const c = dir === 'across' ? pc - j : pc;
          const x = fits(e.answer, r, c, dir);
          if (x > 0 && (!best || x > best.x)) best = { r, c, dir, x };
        }
      }
    }
    if (best) put(e, best.r, best.c, best.dir);
    else {
      // No crossing possible: place it below everything else.
      const maxR = Math.max(...[...cells.keys()].map((k2) => Number(k2.split(',')[0])));
      const minC = Math.min(...[...cells.keys()].map((k2) => Number(k2.split(',')[1])));
      put(e, maxR + 2, minC, 'across');
    }
  }
  // Normalise to start at 0,0 and number the words in reading order.
  const rs = [...cells.keys()].map((k) => Number(k.split(',')[0])); const cs = [...cells.keys()].map((k) => Number(k.split(',')[1]));
  const r0 = Math.min(...rs); const c0 = Math.min(...cs);
  const norm = new Map([...cells].map(([k, v]) => { const [r, c] = k.split(',').map(Number); return [key(r - r0, c - c0), v]; }));
  placed.forEach((p) => { p.r -= r0; p.c -= c0; });
  const starts = [...new Set(placed.map((p) => key(p.r, p.c)))].map((k) => k.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  placed.forEach((p) => { p.num = starts.findIndex(([r, c]) => r === p.r && c === p.c) + 1; });
  return { cells: norm, words: placed, rows: Math.max(...rs) - r0 + 1, cols: Math.max(...cs) - c0 + 1 };
}

export default {
  id: 'crossword',
  name: 'Crossword',
  icon: 'type-crossword',
  graded: true,
  category: 'games',
  tagline: 'A crossword built automatically from your words and clues.',
  about: {
    summary: 'Enter answers and clues — ReachStudio lays out the crossword grid for you, crossing words where letters match. Learners solve it in the browser, on any device.',
    uses: ['Key vocabulary and definitions', 'End-of-topic revision', 'Spelling of subject terms', 'A fun starter or homework activity'],
    learners: 'Learners click a clue or a square and type; the cursor moves along the word. Click a square twice to switch between across and down. Check marks each word right or wrong; each correct word earns a point.',
    tip: 'Use 6–12 words of different lengths that share common letters — they cross more, which makes a better grid.',
  },
  defaults: () => ({ task: '', words: [{ answer: '', clue: '' }, { answer: '', clue: '' }] }),
  example: () => ({
    title: 'Cell crossword',
    data: { task: '<p>Fill in the crossword about cells.</p>', words: [
      { answer: 'nucleus', clue: 'Controls the cell and contains DNA' },
      { answer: 'membrane', clue: 'Thin layer that controls what enters and leaves the cell' },
      { answer: 'cell', clue: 'The basic unit of life' },
      { answer: 'chloroplast', clue: 'Where photosynthesis happens' },
      { answer: 'energy', clue: 'Released by mitochondria' },
      { answer: 'wall', clue: 'Plant cells have one; animal cells don\'t' },
    ] },
  }),

  editor(data, ctx) {
    const info = h('p', { class: 'help' });
    const upd = () => {
      const valid = data.words.filter((w) => clean(w.answer).length >= 2 && w.clue?.trim());
      if (!valid.length) { info.textContent = ''; return; }
      const l = layoutCrossword(valid);
      const crossed = l.words.filter((w) => l.words.some((o) => o !== w && o.dir !== w.dir && w.answer.split('').some((ch, k) => { const r = w.r + (w.dir === 'down' ? k : 0); const c = w.c + (w.dir === 'across' ? k : 0); return o.dir === 'down' ? c === o.c && r >= o.r && r < o.r + o.answer.length : r === o.r && c >= o.c && c < o.c + o.answer.length; }))).length;
      info.textContent = `Grid: ${l.cols} × ${l.rows}. ${crossed} of ${l.words.length} words cross another word.`;
    };
    upd();
    return h('div', {},
      richField('Instructions (optional)', data, 'task', ctx.onChange, { compact: true }),
      listEditor({
        items: data.words, label: 'Words and clues', addText: 'Add word', min: 1, onChange: () => { ctx.onChange(); upd(); },
        itemLabel: (w, i) => `${i + 1}. ${clean(w.answer) || 'Untitled'}${w.clue ? ` — ${w.clue.slice(0, 32)}` : ''}`,
        create: () => ({ answer: '', clue: '' }),
        renderItem: (w, i, changed) => h('div', {},
          textField('Answer', w, 'answer', () => { changed(); upd(); }, { placeholder: 'One word (spaces and punctuation are removed)' }),
          textField('Clue', w, 'clue', () => { changed(); upd(); })),
      }),
      info);
  },

  render(data, ctx) {
    const valid = (data.words || []).filter((w) => clean(w.answer).length >= 2 && w.clue?.trim());
    if (!valid.length) return emptyState('type-crossword', 'Add words with clues to build the crossword.');
    const L = layoutCrossword(valid);
    const inputs = new Map();
    let dir = 'across'; let active = null;
    const grid = h('div', { class: 'rs-cw-grid', style: { gridTemplateColumns: `repeat(${L.cols}, minmax(0, 1fr))`, '--cols': L.cols } });
    const nums = new Map(L.words.map((w) => [`${w.r},${w.c}`, w.num]));
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
      const k = `${r},${c}`;
      if (!L.cells.has(k)) { grid.append(h('span', { class: 'rs-cw-void' })); continue; }
      const inp = h('input', { class: 'rs-cw-cell', maxlength: 1, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': `Row ${r + 1}, column ${c + 1}` });
      inp._r = r; inp._c = c;
      inputs.set(k, inp);
      grid.append(h('span', { class: 'rs-cw-sq' }, nums.has(k) && h('span', { class: 'n' }, String(nums.get(k))), inp));
    }
    const wordAt = (r, c, d) => L.words.find((w) => w.dir === d && (d === 'across' ? w.r === r && c >= w.c && c < w.c + w.answer.length : w.c === c && r >= w.r && r < w.r + w.answer.length));
    const cellsOf = (w) => Array.from({ length: w.answer.length }, (_, k) => inputs.get(`${w.r + (w.dir === 'down' ? k : 0)},${w.c + (w.dir === 'across' ? k : 0)}`));
    const highlight = () => {
      inputs.forEach((i) => i.parentElement.classList.remove('hl'));
      clueEls.forEach((e) => e.classList.remove('on'));
      if (!active) return;
      const w = wordAt(active._r, active._c, dir) || wordAt(active._r, active._c, dir === 'across' ? 'down' : 'across');
      if (!w) return;
      dir = w.dir;
      cellsOf(w).forEach((i) => i.parentElement.classList.add('hl'));
      clueEls.find((e) => e._w === w)?.classList.add('on');
    };
    grid.addEventListener('focusin', (e) => { if (e.target.classList.contains('rs-cw-cell')) { active = e.target; highlight(); } });
    grid.addEventListener('mousedown', (e) => { if (e.target === active && document.activeElement === active) { dir = dir === 'across' ? 'down' : 'across'; setTimeout(highlight); } });
    const step = (inp, d, delta) => inputs.get(d === 'across' ? `${inp._r},${inp._c + delta}` : `${inp._r + delta},${inp._c}`);
    grid.addEventListener('input', (e) => {
      const inp = e.target; inp.value = clean(inp.value).slice(-1);
      inp.parentElement.classList.remove('ok', 'no');
      if (inp.value) step(inp, dir, 1)?.focus();
    });
    grid.addEventListener('keydown', (e) => {
      const inp = e.target; if (!inp.classList?.contains('rs-cw-cell')) return;
      const moves = { ArrowRight: ['across', 1], ArrowLeft: ['across', -1], ArrowDown: ['down', 1], ArrowUp: ['down', -1] };
      if (moves[e.key]) { e.preventDefault(); const [d, dl] = moves[e.key]; dir = d; (step(inp, d, dl) || inp).focus(); highlight(); }
      if (e.key === 'Backspace' && !inp.value) { e.preventDefault(); const p = step(inp, dir, -1); if (p) { p.value = ''; p.focus(); } }
    });
    const clueEls = [];
    const clueList = (d, title) => h('div', { class: 'rs-cw-clues' }, h('h4', {}, title), h('ol', {}, L.words.filter((w) => w.dir === d).sort((a, b) => a.num - b.num).map((w) => {
      const li = h('li', { tabindex: '0', onclick: () => { dir = d; cellsOf(w)[0].focus(); }, onkeydown: (e) => { if (e.key === 'Enter') { dir = d; cellsOf(w)[0].focus(); } } }, h('b', {}, `${w.num}`), ` ${w.clue} (${w.answer.length})`);
      li._w = w; clueEls.push(li); return li;
    })));
    const actions = actionRow({
      onCheck: () => {
        let score = 0;
        L.words.forEach((w) => { const cs = cellsOf(w); const ok = cs.map((i) => i.value).join('') === w.answer; if (ok) score++; });
        inputs.forEach((inp, k) => { if (inp.value) inp.parentElement.classList.add(inp.value === L.cells.get(k) ? 'ok' : 'no'); });
        actions.checked(score, L.words.length); ctx.report?.(score, L.words.length);
      },
      onRetry: () => { inputs.forEach((inp) => { if (inp.parentElement.classList.contains('no')) inp.value = ''; inp.parentElement.classList.remove('ok', 'no'); }); actions.reset(); },
      onShow: () => inputs.forEach((inp, k) => { inp.value = L.cells.get(k); inp.parentElement.classList.remove('no'); inp.parentElement.classList.add('ok'); }),
    });
    return h('div', { class: 'rs-cw' }, !isBlank(data.task) && richBlock(data.task, 'rs-instructions rs-task'),
      h('div', { class: 'rs-cw-body' }, h('div', { class: 'rs-cw-gridwrap' }, grid), h('div', { class: 'rs-cw-cluecol' }, clueList('across', 'Across'), clueList('down', 'Down'))),
      actions.el);
  },
};
