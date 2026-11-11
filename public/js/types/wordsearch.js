import { h, textField, segmentField, checkField, richField, richBlock, isBlank, emptyState } from '../util.js';
import { icon } from '../icons.js';
import { seededRandom } from './_shared.js';

const clean = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, '');
const DIRS = { easy: [[0, 1], [1, 0]], medium: [[0, 1], [1, 0], [1, 1], [-1, 1]], hard: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]] };

/** Builds the letter grid. Deterministic for the same words and difficulty. */
export function buildWordSearch(words, level = 'medium') {
  const list = [...new Set(words.map(clean).filter((w) => w.length >= 2))].sort((a, b) => b.length - a.length);
  const letters = list.join('');
  let size = Math.max(8, list[0]?.length || 0, Math.ceil(Math.sqrt(letters.length * 2.2)));
  for (let attempt = 0; attempt < 6; attempt++, size++) {
    const rand = seededRandom(`${list.join('|')}#${level}#${attempt}`);
    const grid = Array.from({ length: size }, () => new Array(size).fill(''));
    const placed = [];
    let ok = true;
    for (const w of list) {
      let done = false;
      for (let t = 0; t < 400 && !done; t++) {
        const [dr, dc] = DIRS[level][Math.floor(rand() * DIRS[level].length)];
        const r = Math.floor(rand() * size); const c = Math.floor(rand() * size);
        const er = r + dr * (w.length - 1); const ec = c + dc * (w.length - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        let fits = true;
        for (let k = 0; k < w.length; k++) { const ch = grid[r + dr * k][c + dc * k]; if (ch && ch !== w[k]) { fits = false; break; } }
        if (!fits) continue;
        for (let k = 0; k < w.length; k++) grid[r + dr * k][c + dc * k] = w[k];
        placed.push({ word: w, r, c, dr, dc });
        done = true;
      }
      if (!done) { ok = false; break; }
    }
    if (!ok) continue;
    const abc = 'ABCDEFGHIJKLMNOPRSTUVWY';
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!grid[r][c]) grid[r][c] = abc[Math.floor(rand() * abc.length)];
    return { grid, size, placed };
  }
  return null;
}

export default {
  id: 'wordsearch',
  name: 'Word Search',
  icon: 'type-wordsearch',
  graded: true,
  category: 'games',
  tagline: 'Find the hidden words in a grid of letters.',
  about: {
    summary: 'Enter a list of words and ReachStudio hides them in a letter grid — across, down, diagonally or backwards depending on the difficulty. Learners find and select each word.',
    uses: ['Familiarising learners with new vocabulary', 'Spelling practice for key terms', 'A quiet starter or early-finisher activity', 'Younger learners and language classes'],
    learners: 'Learners drag across letters (or click the first and last letter) to select a word. Found words are highlighted and crossed off the list. Each word found earns a point.',
    tip: 'Use 6–12 words. "Easy" (across and down only) suits younger learners; "Hard" adds diagonals and backwards words.',
  },
  defaults: () => ({ task: '', words: '', level: 'medium', showList: true }),
  example: () => ({ title: 'Cell words', data: { task: '<p>Find the words about cells.</p>', words: 'nucleus, membrane, cytoplasm, wall, energy, cell, chloroplast', level: 'medium', showList: true } }),

  editor(data, ctx) {
    const info = h('p', { class: 'help' });
    const upd = () => { const ws = String(data.words).split(/[,\n]/).map(clean).filter((w) => w.length >= 2); const g = ws.length && buildWordSearch(ws, data.level); info.textContent = ws.length ? (g ? `${ws.length} words in a ${g.size} × ${g.size} grid.` : 'Those words don\'t fit — try fewer or shorter words.') : ''; };
    upd();
    return h('div', {},
      richField('Instructions (optional)', data, 'task', ctx.onChange, { compact: true }),
      textField('Words to find', data, 'words', () => { ctx.onChange(); upd(); }, { multiline: true, rows: 4, placeholder: 'One per line, or separated by commas. Letters only.' }),
      info,
      segmentField('Difficulty', data, 'level', [['easy', 'Easy — across and down'], ['medium', 'Medium — plus diagonals'], ['hard', 'Hard — plus backwards']], () => { ctx.onChange(); upd(); }, { showText: true }),
      checkField('Show the list of words to find', data, 'showList', ctx.onChange));
  },

  render(data, ctx) {
    const words = String(data.words || '').split(/[,\n]/).map((w) => w.trim()).filter((w) => clean(w).length >= 2);
    if (!words.length) return emptyState('type-wordsearch', 'Add the words learners should find.');
    const W = buildWordSearch(words, data.level || 'medium');
    if (!W) return emptyState('type-wordsearch', 'These words don\'t fit in a grid — try fewer or shorter words.');
    const found = new Set();
    const cellEls = [];
    const grid = h('div', { class: 'rs-ws-grid', style: { gridTemplateColumns: `repeat(${W.size}, 1fr)` }, role: 'grid', 'aria-label': 'Letter grid' });
    W.grid.forEach((row, r) => row.forEach((ch, c) => { const b = h('button', { type: 'button', class: 'rs-ws-cell', 'data-r': r, 'data-c': c, tabindex: '-1', 'aria-label': `${ch}, row ${r + 1}, column ${c + 1}` }, ch); cellEls.push(b); grid.append(b); }));
    cellEls[0].tabIndex = 0;
    const cellAt = (r, c) => cellEls[r * W.size + c];
    const listEl = h('ul', { class: 'rs-ws-list' }, W.placed.map((p) => h('li', { 'data-w': p.word }, words.find((w) => clean(w) === p.word) || p.word)));
    const status = h('span', { class: 'rs-score' }, `0 / ${W.placed.length}`);
    const line = (a, b) => {
      const dr = Math.sign(b.r - a.r); const dc = Math.sign(b.c - a.c);
      const len = Math.max(Math.abs(b.r - a.r), Math.abs(b.c - a.c));
      if (!(a.r === b.r || a.c === b.c || Math.abs(b.r - a.r) === Math.abs(b.c - a.c))) return null;
      return Array.from({ length: len + 1 }, (_, k) => ({ r: a.r + dr * k, c: a.c + dc * k }));
    };
    let anchor = null; let path = [];
    const paint = (cells) => { cellEls.forEach((e) => e.classList.remove('sel')); cells.forEach(({ r, c }) => cellAt(r, c).classList.add('sel')); };
    const commit = () => {
      const s = path.map(({ r, c }) => W.grid[r][c]).join('');
      const hit = W.placed.find((p) => !found.has(p.word) && (p.word === s || p.word === [...s].reverse().join('')) && path.length === p.word.length
        && ((path[0].r === p.r && path[0].c === p.c) || (path.at(-1).r === p.r && path.at(-1).c === p.c)));
      if (hit) {
        found.add(hit.word);
        path.forEach(({ r, c }) => cellAt(r, c).classList.add('found'));
        listEl.querySelector(`[data-w="${hit.word}"]`).classList.add('done');
        status.textContent = `${found.size} / ${W.placed.length}`;
        if (found.size === W.placed.length) { ctx.report?.(found.size, W.placed.length); status.textContent += ' — all found!'; }
      }
      paint([]); anchor = null; path = [];
    };
    const pos = (el) => ({ r: Number(el.dataset.r), c: Number(el.dataset.c) });
    let dragging = false;
    grid.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.rs-ws-cell'); if (!el) return;
      e.preventDefault(); grid.setPointerCapture?.(e.pointerId);
      if (anchor && !dragging) { // click-click selection
        path = line(anchor, pos(el)) || []; if (path.length) commit(); else { anchor = pos(el); path = [anchor]; paint(path); }
        return;
      }
      dragging = true; anchor = pos(el); path = [anchor]; paint(path);
    });
    grid.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.rs-ws-cell'); if (!el) return;
      const p = line(anchor, pos(el)); if (p) { path = p; paint(path); }
    });
    grid.addEventListener('pointerup', () => { if (!dragging) return; dragging = false; if (path.length > 1) commit(); });
    grid.addEventListener('keydown', (e) => {
      const el = e.target.closest('.rs-ws-cell'); if (!el) return;
      const { r, c } = pos(el);
      const mv = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
      if (mv) { e.preventDefault(); const n = cellAt(Math.min(W.size - 1, Math.max(0, r + mv[0])), Math.min(W.size - 1, Math.max(0, c + mv[1]))); el.tabIndex = -1; n.tabIndex = 0; n.focus(); if (anchor) { const p = line(anchor, pos(n)); if (p) { path = p; paint(path); } } }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!anchor) { anchor = { r, c }; path = [anchor]; paint(path); } else { path = line(anchor, { r, c }) || []; if (path.length > 1) commit(); else { anchor = null; paint([]); } } }
    });
    const reveal = h('button', { class: 'btn rs-reveal', type: 'button', onclick: () => { W.placed.forEach((p) => { if (!found.has(p.word)) for (let k = 0; k < p.word.length; k++) cellAt(p.r + p.dr * k, p.c + p.dc * k).classList.add('missed'); }); ctx.report?.(found.size, W.placed.length); reveal.disabled = true; } }, icon('eye', { size: 16 }), h('span', {}, 'Show the words'));
    return h('div', { class: 'rs-ws' }, !isBlank(data.task) && richBlock(data.task, 'rs-instructions rs-task'),
      h('div', { class: 'rs-ws-body' }, grid, data.showList !== false && h('div', { class: 'rs-ws-side' }, h('h4', {}, 'Find these words'), listEl)),
      h('div', { class: 'rs-actions' }, reveal, status),
      h('p', { class: 'rs-status' }, 'Drag across a word, or click its first and last letter.'));
  },
};
