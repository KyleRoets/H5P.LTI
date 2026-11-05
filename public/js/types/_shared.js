// Helpers shared by several content types.
import { h, sanitizeHtml, answersHtml } from '../util.js';

/**
 * Builds the learner view of a rich text containing <mark> answers.
 * mark(answerText) must return the element that replaces each marked answer.
 * word(text) (optional) turns every other word into an element too (Mark the Words).
 */
export function buildAnswerText(data, { mark, word }) {
  const root = h('div', { class: 'rs-text rs-answer-text' });
  root.innerHTML = answersHtml(data);
  [...root.querySelectorAll('mark')].forEach((m) => m.replaceWith(mark(m.textContent.trim())));
  if (word) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('.rs-answer-el') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const frag = document.createDocumentFragment();
      for (const tok of n.textContent.split(/(\s+)/)) {
        if (!tok) continue;
        if (/^\s+$/.test(tok)) { frag.append(tok); continue; }
        const m = tok.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
        if (m[1]) frag.append(m[1]);
        if (m[2]) frag.append(word(m[2]));
        if (m[3]) frag.append(m[3]);
      }
      n.replaceWith(frag);
    }
  }
  return root;
}

export const countAnswers = (data) => {
  const div = document.createElement('div');
  div.innerHTML = answersHtml(data);
  return div.querySelectorAll('mark').length;
};

export { sanitizeHtml };

// ---------- deterministic randomness (same layout every time for the same content) ----------
export function hashString(s) {
  let h1 = 1779033703 ^ String(s).length;
  for (let i = 0; i < String(s).length; i++) { h1 = Math.imul(h1 ^ String(s).charCodeAt(i), 3432918353); h1 = (h1 << 13) | (h1 >>> 19); }
  return h1 >>> 0;
}
/** Small seeded PRNG (mulberry32). seededRandom('abc')() → 0..1 */
export function seededRandom(seed) {
  let a = typeof seed === 'number' ? seed : hashString(seed);
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const seededShuffle = (arr, rand) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Lower-case, trimmed, punctuation-free form used to compare typed answers. */
export const normalize = (s) => String(s || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s'-]/gu, '').replace(/\s+/g, ' ').trim();

// ---------- rectangle zone editor (drag to move, corner to resize) ----------
/**
 * zones: array of { x, y, w, h } in %. label(z, i) and color(z) control how each zone is drawn.
 * onAdd(x, y) is called when the empty image is clicked (optional).
 */
export function zoneEditor({ getImage, zones, onChange, label = (z, i) => `Zone ${i + 1}`, color = () => '#193B82', placeholder = 'Upload an image above', onAdd }) {
  const canvas = h('div', { class: 'pos-canvas zone-canvas' });
  const draw = () => {
    const url = getImage();
    canvas.replaceChildren(url ? h('img', { src: url, alt: '' }) : h('div', { class: 'placeholder' }, h('span', {}, placeholder)));
    zones.forEach((z, i) => {
      const handle = h('span', { class: 'resize', title: 'Drag to resize' });
      const el = h('div', { class: 'pos-zone', style: { left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%`, '--zone-color': color(z) } }, h('span', { class: 'zl' }, label(z, i)), handle);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const r = canvas.getBoundingClientRect();
        const resizing = e.target === handle;
        const sx = e.clientX; const sy = e.clientY; const o = { ...z };
        const move = (ev) => {
          const dx = ((ev.clientX - sx) / r.width) * 100; const dy = ((ev.clientY - sy) / r.height) * 100;
          if (resizing) { z.w = Math.max(4, Math.min(100 - z.x, o.w + dx)); z.h = Math.max(4, Math.min(100 - z.y, o.h + dy)); }
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
  if (onAdd) {
    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('click', (e) => {
      if (!getImage() || e.target.closest('.pos-zone')) return;
      const r = canvas.getBoundingClientRect();
      onAdd(Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10);
      draw();
    });
  }
  draw();
  return { canvas, draw };
}

// ---------- reorderable list for learners (drag, or move with buttons/keyboard) ----------
export function sortableList(list, { onChange } = {}) {
  const items = () => [...list.children];
  list.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('.rs-sort-item');
    if (!item || list.dataset.locked || e.target.closest('button')) return;
    e.preventDefault();
    const startY = e.clientY; const startX = e.clientX; let moved = false;
    item.classList.add('dragging');
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
      moved = true;
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.rs-sort-item');
      if (over && over !== item && list.contains(over)) {
        const r = over.getBoundingClientRect();
        const horizontal = getComputedStyle(list).flexDirection === 'row';
        const after = horizontal ? ev.clientX > r.left + r.width / 2 : ev.clientY > r.top + r.height / 2;
        over[after ? 'after' : 'before'](item);
      }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); item.classList.remove('dragging'); if (moved) onChange?.(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  const shift = (item, dir) => {
    const sib = dir < 0 ? item.previousElementSibling : item.nextElementSibling;
    if (!sib || list.dataset.locked) return;
    if (dir < 0) sib.before(item); else sib.after(item);
    onChange?.();
    item.querySelector(dir < 0 ? '.up' : '.down')?.focus();
  };
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button.up, button.down');
    if (b) shift(b.closest('.rs-sort-item'), b.classList.contains('up') ? -1 : 1);
  });
  list.addEventListener('keydown', (e) => {
    const item = e.target.closest('.rs-sort-item');
    if (!item || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) || e.target.closest('button')) return;
    e.preventDefault(); shift(item, e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1); item.focus();
  });
  return { items };
}
