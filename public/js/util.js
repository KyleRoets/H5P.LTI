// Shared helpers for the studio and the player. No dependencies.
import { icon } from './icons.js';

/** Tiny element builder: h('div', {class:'x', onclick}, child, 'text', [more]) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
      }
    }
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Icon-only button with an accessible label and tooltip. */
export const iconBtn = (name, label, onclick, { cls = '', disabled = false } = {}) =>
  h('button', { class: `icon-btn ${cls}`, type: 'button', title: label, 'aria-label': label, onclick, disabled }, icon(name));

// ---------------- rich text ----------------

const TAGS = {
  P: 'p', DIV: 'p', BR: 'br', B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', U: 'u', S: 's', STRIKE: 's', DEL: 's',
  SPAN: 'span', FONT: 'span', UL: 'ul', OL: 'ol', LI: 'li', A: 'a', MARK: 'mark', H2: 'h3', H3: 'h3', H4: 'h4',
  BLOCKQUOTE: 'blockquote', SUB: 'sub', SUP: 'sup',
};
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'TEXTAREA', 'INPUT', 'SELECT', 'BUTTON', 'FORM', 'HEAD', 'TITLE', 'META', 'LINK']);
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\))$/i;
const ALIGN_RE = /^(left|center|right|justify)$/;

/**
 * Allow-list HTML sanitiser for author-written rich text. Rebuilds the DOM from scratch,
 * keeping only formatting tags, safe colours/alignment and http(s)/mailto links.
 */
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const out = document.createElement('div');
  const walk = (from, to) => {
    for (const node of from.childNodes) {
      if (node.nodeType === 3) { to.append(node.textContent); continue; }
      if (node.nodeType !== 1) continue;
      const name = node.nodeName.toUpperCase();
      if (DROP.has(name)) continue;
      const tag = TAGS[name];
      if (!tag) { walk(node, to); continue; }
      const el = document.createElement(tag);
      const st = node.style || {};
      const color = (name === 'FONT' ? node.getAttribute('color') : st.color) || '';
      const bg = st.backgroundColor || '';
      if (COLOR_RE.test(color.trim())) el.style.color = color.trim();
      if (COLOR_RE.test(bg.trim())) el.style.backgroundColor = bg.trim();
      if (st.textAlign && ALIGN_RE.test(st.textAlign) && ['p', 'h3', 'h4', 'li', 'blockquote'].includes(tag)) el.style.textAlign = st.textAlign;
      if (tag === 'a') {
        const href = node.getAttribute('href') || '';
        if (/^(https?:|mailto:)/i.test(href.trim())) { el.setAttribute('href', href.trim()); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      }
      if (tag === 'span' && !el.getAttribute('style')) { walk(node, to); continue; } // drop empty spans
      walk(node, el);
      to.append(el);
    }
  };
  walk(doc.body, out);
  return out.innerHTML;
}

// Older content used markdown-style bold and italic shortcuts in plain text; convert that to HTML.
function legacyToHtml(src) {
  const paras = String(src ?? '').trim().split(/\n{2,}/);
  return paras.filter(Boolean).map((p) => {
    let s = esc(p);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])_(.+?)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
    return `<p>${s.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}
// Rich text from the editor is HTML; it may contain only entities (e.g. "What?&nbsp;") and no tags.
const looksHtml = (v) => /<\/?[a-z][\s\S]*>|&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(String(v || ''));

/** Safe HTML for any stored rich-text value (new HTML or legacy plain text). */
export const richHtml = (v) => sanitizeHtml(looksHtml(v) ? v : legacyToHtml(v));
export const richBlock = (v, cls = '') => h('div', { class: `rs-text ${cls}`, html: richHtml(v) });
/** Plain text of a rich value (tags removed, entities decoded), e.g. for list labels. */
export function htmlToText(v) {
  const d = document.createElement('div');
  d.innerHTML = richHtml(v);
  return d.textContent.replace(/\s+/g, ' ').trim();
}
export const isBlank = (v) => !htmlToText(v);

/** Legacy "*answer*" plain-text syntax → HTML with <mark> answers. */
export function answersHtml(data) {
  if (data.html !== undefined) return sanitizeHtml(data.html);
  const t = esc(data.text || '').replace(/\*([^*\n]+)\*/g, '<mark>$1</mark>');
  return t.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

export function safeUrl(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (s.startsWith('/media/') || s.startsWith('/img/')) return s;
  try { const x = new URL(s); return ['http:', 'https:'].includes(x.protocol) ? x.href : ''; } catch { return ''; }
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
export function parseTime(v) {
  const s = String(v || '').trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const rid = () => Math.random().toString(36).slice(2, 9);

// ---------------- API client ----------------
export function makeApi(getToken) {
  async function call(method, path, body, isForm) {
    const headers = {};
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    if (body && !isForm) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; e.data = data; throw e; }
    return data;
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b || {}),
    put: (p, b) => call('PUT', p, b),
    patch: (p, b) => call('PATCH', p, b),
    del: (p) => call('DELETE', p),
    upload: (file) => { const f = new FormData(); f.append('file', file); return call('POST', '/api/uploads', f, true); },
  };
}

// ---------------- feedback UI ----------------
export function toast(msg, type = '') {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const t = h('div', { class: `toast ${type}`, role: 'status' }, icon(type === 'error' ? 'info' : 'check', { size: 16 }), h('span', {}, msg));
  document.body.append(t);
  setTimeout(() => t.remove(), 3400);
}

export function modal({ title, body, confirm = 'OK', cancel = 'Cancel', danger = false, wide = false }) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); resolve(v); };
    const content = typeof body === 'string' ? h('p', {}, body) : body;
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(null); } },
      h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: 'modal-head' }, h('h3', {}, title), iconBtn('x', 'Close', () => close(null))),
        content,
        (confirm || cancel) && h('div', { class: 'modal-actions' },
          cancel && h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, cancel),
          confirm && h('button', { class: `btn ${danger ? 'danger-solid' : 'primary'}`, type: 'button', onclick: () => close(content.querySelector?.('input:not([type=checkbox]),select')?.value ?? true) }, confirm))));
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && e.target.tagName === 'INPUT') close(e.target.value); });
    document.body.append(back);
    (back.querySelector('.modal input,.modal select') || back.querySelector('.btn.primary,.btn.danger-solid'))?.focus();
  });
}

// ---------------- editor field components ----------------
// Every field mutates the given object in place and calls onChange().

export function textField(label, obj, key, onChange, opts = {}) {
  const input = h(opts.multiline ? 'textarea' : 'input', {
    type: opts.multiline ? undefined : (opts.type || 'text'),
    value: obj[key] ?? '',
    placeholder: opts.placeholder || '',
    rows: opts.rows,
    min: opts.min, max: opts.max, step: opts.step,
    oninput: (e) => { obj[key] = opts.type === 'number' ? Number(e.target.value) : e.target.value; onChange(); },
  });
  if (opts.multiline) input.value = obj[key] ?? '';
  return h('div', { class: 'field' }, label ? h('label', {}, label, input) : input, opts.help && h('p', { class: 'help' }, opts.help));
}

export function selectField(label, obj, key, options, onChange, opts = {}) {
  const sel = h('select', { onchange: (e) => { obj[key] = e.target.value; onChange(); opts.after?.(); } },
    options.map(([v, t]) => h('option', { value: v, selected: obj[key] === v }, t)));
  return h('div', { class: 'field' }, h('label', {}, label, sel), opts.help && h('p', { class: 'help' }, opts.help));
}

/** Segmented control: options [[value, label, iconName?]] */
export function segmentField(label, obj, key, options, onChange, opts = {}) {
  const wrap = h('div', { class: 'segment', role: 'radiogroup', 'aria-label': label });
  const draw = () => wrap.replaceChildren(...options.map(([v, t, ic]) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(obj[key] === v), class: obj[key] === v ? 'on' : '', title: t,
    onclick: () => { obj[key] = v; onChange(); draw(); opts.after?.(); },
  }, ic && icon(ic, { size: 16 }), (!ic || opts.showText) && h('span', {}, t))));
  draw();
  return h('div', { class: 'field' }, h('div', { class: 'label' }, label), wrap);
}

export function checkField(label, obj, key, onChange, opts = {}) {
  return h('div', { class: 'field' }, h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: !!obj[key], onchange: (e) => { obj[key] = e.target.checked; onChange(); opts.after?.(); } }), h('span', {}, label)));
}

export const SWATCHES = ['#193B82', '#278DDF', '#0E8AA0', '#1F9D6A', '#4E9A2E', '#D9940C', '#E0702E', '#D23B6B', '#B8326E', '#6C4EE0', '#47587A', '#1D2433', '#FFFFFF', '#F4F6FA', '#FFF4D6', '#E3F6EC'];

/** Colour picker with brand swatches + custom colour. allowEmpty adds "Default". */
export function colorField(label, obj, key, onChange, opts = {}) {
  const wrap = h('div', { class: 'color-field' });
  const draw = () => {
    const cur = obj[key] || '';
    wrap.replaceChildren(...[
      opts.allowEmpty && h('button', { type: 'button', class: `swatch none ${!cur ? 'on' : ''}`, title: 'Default', 'aria-label': 'Default colour', onclick: () => { obj[key] = ''; onChange(); draw(); } }),
      ...(opts.swatches || SWATCHES).map((c) => h('button', { type: 'button', class: `swatch ${cur.toLowerCase() === c.toLowerCase() ? 'on' : ''}`, style: { background: c }, title: c, 'aria-label': `Colour ${c}`, onclick: () => { obj[key] = c; onChange(); draw(); } })),
      h('label', { class: 'swatch custom', title: 'Custom colour' }, icon('palette', { size: 14 }),
        h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#278ddf', 'aria-label': `Custom ${label}`, oninput: (e) => { obj[key] = e.target.value; onChange(); }, onchange: draw }))].filter(Boolean));
  };
  draw();
  return h('div', { class: 'field' }, h('div', { class: 'label' }, label), wrap);
}

/** Image / media field with upload + URL. ctx.api is required for upload. */
export function mediaField(label, obj, key, onChange, ctx, opts = {}) {
  const accept = opts.accept || 'image/png,image/jpeg,image/gif,image/webp';
  const wrap = h('div', { class: 'media-field' });
  const draw = () => {
    wrap.replaceChildren();
    const url = safeUrl(obj[key]);
    const file = h('input', { type: 'file', accept, class: 'hidden', onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      up.disabled = true; up.lastChild.textContent = 'Uploading…';
      try { const r = await ctx.api.upload(f); obj[key] = r.url; onChange(); draw(); } catch (err) { toast(err.message, 'error'); up.disabled = false; up.lastChild.textContent = 'Upload'; }
    } });
    const up = h('button', { class: 'btn sm', type: 'button', onclick: () => file.click() }, icon('upload', { size: 15 }), h('span', {}, url ? 'Replace' : 'Upload'));
    if (url) wrap.append(h('div', { class: 'media-thumb' }, opts.audio ? h('audio', { src: url, controls: true, preload: 'none' }) : opts.video && !/youtu/.test(url) ? h('video', { src: url, controls: true, preload: 'metadata' }) : opts.video ? h('div', { class: 'yt-thumb' }, icon('type-video', { size: 28 }), 'YouTube video') : h('img', { src: url, alt: '' })));
    else wrap.append(h('button', { type: 'button', class: 'media-drop', onclick: () => file.click() }, icon(opts.audio ? 'type-dictation' : opts.video ? 'type-video' : 'image', { size: 26 }), h('span', {}, opts.audio ? 'Click to upload an MP3 recording' : opts.video ? 'Click to upload an MP4 or WebM video' : 'Click to upload an image')));
    // Media must be uploaded: links to files elsewhere can break or change without notice.
    wrap.append(h('div', { class: 'row' }, up, file, obj[key] && iconBtn('trash', 'Remove', () => { obj[key] = ''; onChange(); draw(); })));
  };
  draw();
  return h('div', { class: 'field' }, label && h('div', { class: 'label' }, label), wrap, opts.help && h('p', { class: 'help' }, opts.help));
}

/**
 * Rich text editor (bold, italic, underline, strikethrough, colours, lists, alignment, links).
 * opts.answers = 'blank' | 'word' adds a button that marks the selection as an answer (<mark>).
 */
export function richField(label, obj, key, onChange, opts = {}) {
  const ed = h('div', { class: `rte-body ${opts.answers ? 'has-answers' : ''} ${opts.compact ? 'compact' : ''}`, contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': label || 'Text', 'data-placeholder': opts.placeholder || 'Start typing…' });
  ed.innerHTML = opts.answers ? answersHtml({ html: obj[key] }) : richHtml(obj[key]);
  let saved = null;
  const sync = () => { obj[key] = sanitizeHtml(ed.innerHTML); onChange(); refresh(); };
  const saveSel = () => { const s = getSelection(); if (s.rangeCount && ed.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); };
  const restore = () => { ed.focus(); if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } };
  const exec = (cmd, val = null, css = false) => { restore(); document.execCommand('styleWithCSS', false, css); document.execCommand(cmd, false, val); saveSel(); sync(); };
  ed.addEventListener('input', sync);
  ed.addEventListener('keyup', saveSel);
  ed.addEventListener('mouseup', saveSel);
  ed.addEventListener('paste', (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, html ? sanitizeHtml(html) : esc(text).replace(/\n/g, '<br>'));
  });
  ed.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b' || k === 'i' || k === 'u') { e.preventDefault(); exec({ b: 'bold', i: 'italic', u: 'underline' }[k]); }
  });

  const toggles = [];
  const tb = (ic, label2, fn, state) => {
    const b = h('button', { type: 'button', class: 'rte-btn', title: label2, 'aria-label': label2, onmousedown: (e) => e.preventDefault(), onclick: fn }, icon(ic, { size: 16 }));
    if (state) toggles.push([b, state]);
    return b;
  };
  const colorBtn = (ic, label2, cmd) => {
    const bar = h('span', { class: 'rte-color-bar' });
    const pop = h('div', { class: 'rte-pop hidden' },
      ...SWATCHES.map((c) => h('button', { type: 'button', class: 'swatch', style: { background: c }, title: c, 'aria-label': c, onmousedown: (e) => e.preventDefault(), onclick: () => { pop.classList.add('hidden'); bar.style.background = c; exec(cmd, c, true); } })),
      h('button', { type: 'button', class: 'swatch none', title: 'Remove colour', 'aria-label': 'Remove colour', onmousedown: (e) => e.preventDefault(), onclick: () => { pop.classList.add('hidden'); exec(cmd, cmd === 'hiliteColor' ? 'transparent' : '#1d2433', true); } }),
      h('label', { class: 'swatch custom', title: 'Custom' }, icon('palette', { size: 14 }), h('input', { type: 'color', onchange: (e) => { pop.classList.add('hidden'); exec(cmd, e.target.value, true); } })));
    const b = h('button', { type: 'button', class: 'rte-btn color', title: label2, 'aria-label': label2, onmousedown: (e) => { e.preventDefault(); saveSel(); }, onclick: () => pop.classList.toggle('hidden') }, icon(ic, { size: 16 }), bar);
    return h('span', { class: 'rte-color' }, b, pop);
  };
  const qs = (c) => () => { try { return document.queryCommandState(c); } catch { return false; } };
  const toolbar = h('div', { class: 'rte-toolbar', role: 'toolbar', 'aria-label': `${label || 'Text'} formatting` },
    tb('bold', 'Bold (Ctrl+B)', () => exec('bold'), qs('bold')),
    tb('italic', 'Italic (Ctrl+I)', () => exec('italic'), qs('italic')),
    tb('underline', 'Underline (Ctrl+U)', () => exec('underline'), qs('underline')),
    tb('strike', 'Strikethrough', () => exec('strikeThrough'), qs('strikeThrough')),
    h('span', { class: 'rte-sep' }),
    colorBtn('text-color', 'Text colour', 'foreColor'),
    colorBtn('highlight', 'Highlight colour', 'hiliteColor'),
    !opts.compact && h('span', { class: 'rte-sep' }),
    !opts.compact && tb('list', 'Bulleted list', () => exec('insertUnorderedList'), qs('insertUnorderedList')),
    !opts.compact && tb('list-ordered', 'Numbered list', () => exec('insertOrderedList'), qs('insertOrderedList')),
    !opts.compact && h('select', { class: 'rte-align', 'aria-label': 'Alignment', onmousedown: saveSel, onchange: (e) => { exec(e.target.value); e.target.value = ''; } },
      h('option', { value: '' }, 'Align'), h('option', { value: 'justifyLeft' }, 'Left'), h('option', { value: 'justifyCenter' }, 'Centre'), h('option', { value: 'justifyRight' }, 'Right')),
    h('span', { class: 'rte-sep' }),
    tb('link', 'Add link', async () => {
      saveSel();
      const url = await modal({ title: 'Add a link', body: h('div', {}, h('label', {}, 'Web address', h('input', { type: 'url', placeholder: 'https://…' }))), confirm: 'Add link' });
      if (typeof url === 'string' && /^(https?:|mailto:)/i.test(url.trim())) exec('createLink', url.trim());
      else if (url) toast('Links must start with https://', 'error');
    }),
    tb('eraser', 'Clear formatting', () => { exec('removeFormat'); exec('unlink'); }),
    opts.answers && h('span', { class: 'rte-sep' }),
    opts.answers && h('button', { type: 'button', class: 'btn sm rte-answer', onmousedown: (e) => e.preventDefault(), onclick: () => { toggleMark(); } },
      icon('mark', { size: 15 }), h('span', {}, opts.answers === 'word' ? 'Mark as correct' : 'Make answer')));
  const refresh = () => toggles.forEach(([b, st]) => b.classList.toggle('on', ed === document.activeElement && st()));
  // Remember the selection whenever it changes inside the editor (mouse, keyboard or touch handles).
  document.addEventListener('selectionchange', () => { if (ed.isConnected && ed.contains(getSelection().anchorNode)) { saveSel(); refresh(); } });

  function toggleMark() {
    restore();
    const sel = getSelection();
    if (!sel.rangeCount || !ed.contains(sel.anchorNode)) { toast('Select a word or phrase in the text first.', 'error'); return; }
    const inMark = (n) => { while (n && n !== ed) { if (n.nodeName === 'MARK') return n; n = n.parentNode; } return null; };
    const m = inMark(sel.anchorNode) || inMark(sel.focusNode);
    if (m) { m.replaceWith(...m.childNodes); sync(); return; }
    const r = sel.getRangeAt(0);
    if (r.collapsed) { toast('Select a word or phrase in the text first.', 'error'); return; }
    // Trim surrounding spaces from the selection so answers don't include them.
    const text = r.toString();
    if (!text.trim()) return;
    const mark = document.createElement('mark');
    mark.append(r.extractContents());
    mark.querySelectorAll('mark').forEach((x) => x.replaceWith(...x.childNodes));
    r.insertNode(mark);
    sel.removeAllRanges();
    sync();
  }

  return h('div', { class: 'field' }, label && h('div', { class: 'label' }, label), h('div', { class: 'rte' }, toolbar, ed), opts.help && h('p', { class: 'help' }, opts.help));
}

/**
 * Repeatable list editor with add / duplicate / remove / move / collapse.
 * renderItem(item, index, changed) returns the body element for one item.
 */
export function listEditor({ items, label, itemLabel, create, renderItem, onChange, min = 0, addText = 'Add', startCollapsed = false, empty, itemIcon }) {
  const wrap = h('div', { class: 'list-editor' });
  const collapsed = new WeakSet();
  if (startCollapsed) items.forEach((it) => collapsed.add(it));
  const draw = () => {
    wrap.replaceChildren();
    if (!items.length && empty) wrap.append(h('p', { class: 'list-empty' }, empty));
    items.forEach((item, i) => {
      const lab = h('span', { class: 'lbl' }, itemLabel(item, i));
      const changed = () => { lab.textContent = itemLabel(item, i); onChange(); };
      const box = h('div', { class: `list-item ${collapsed.has(item) ? 'collapsed' : ''}` });
      const toggle = () => { collapsed.has(item) ? collapsed.delete(item) : collapsed.add(item); box.classList.toggle('collapsed'); };
      const head = h('div', { class: 'list-item-head', onclick: (e) => { if (!e.target.closest('button')) toggle(); } },
        h('span', { class: 'caret' }, icon('chevron-down', { size: 16 })),
        itemIcon && h('span', { class: 'item-ico' }, itemIcon(item, i)),
        lab,
        iconBtn('chevron-up', 'Move up', () => { items.splice(i - 1, 0, items.splice(i, 1)[0]); onChange(); draw(); }, { disabled: i === 0 }),
        iconBtn('chevron-down', 'Move down', () => { items.splice(i + 1, 0, items.splice(i, 1)[0]); onChange(); draw(); }, { disabled: i === items.length - 1 }),
        iconBtn('copy', 'Duplicate', () => { const c = clone(item); if (c.id) c.id = rid(); items.splice(i + 1, 0, c); onChange(); draw(); }),
        iconBtn('trash', 'Delete', () => { items.splice(i, 1); onChange(); draw(); }, { cls: 'danger', disabled: items.length <= min }));
      box.append(head, h('div', { class: 'list-item-body' }, renderItem(item, i, changed)));
      wrap.append(box);
    });
    wrap.append(h('button', { class: 'btn sm add-btn', type: 'button', onclick: () => { items.push(create()); onChange(); draw(); wrap.querySelector('.list-item:last-of-type input, .list-item:last-of-type [contenteditable]')?.focus(); } }, icon('plus', { size: 15 }), h('span', {}, addText)));
  };
  draw();
  return h('div', { class: 'field' }, label && h('div', { class: 'section-title' }, label), wrap);
}

/** Answer options with "correct" toggles. multi=false makes it single-answer. */
export function optionsEditor(q, onChange, { multi = true, fixed = false } = {}) {
  const wrap = h('div', { class: 'options-editor' });
  const name = `c${Math.random().toString(36).slice(2)}`;
  const draw = () => {
    wrap.replaceChildren();
    q.options.forEach((o, i) => {
      wrap.append(h('div', { class: `option-row ${o.correct ? 'is-correct' : ''}` },
        h('label', { class: 'correct-toggle', title: 'Mark as correct' },
          h('input', { type: multi ? 'checkbox' : 'radio', name, checked: !!o.correct,
            onchange: (e) => { if (!multi) q.options.forEach((x) => { x.correct = false; }); o.correct = e.target.checked; onChange(); draw(); } }),
          h('span', { class: 'tick' }, icon('check', { size: 14, stroke: 3 }))),
        h('input', { type: 'text', value: o.text, placeholder: `Answer ${i + 1}`, disabled: fixed, 'aria-label': `Answer ${i + 1}`, oninput: (e) => { o.text = e.target.value; onChange(); } }),
        !fixed && iconBtn('trash', 'Remove answer', () => { q.options.splice(i, 1); onChange(); draw(); }, { disabled: q.options.length <= 2 })));
    });
    if (!fixed) wrap.append(h('button', { class: 'btn sm add-btn', type: 'button', onclick: () => { q.options.push({ text: '', correct: false }); onChange(); draw(); } }, icon('plus', { size: 15 }), h('span', {}, 'Answer')));
  };
  draw();
  return h('div', { class: 'field' }, h('div', { class: 'label' }, 'Answers ', h('span', { class: 'hint' }, '(tick the correct ones)')), wrap);
}

// ---------------- appearance ----------------
export const FONTS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  brand: '"Alegreya Sans", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};
export const EMBED_WIDTHS = [[560, 'Small'], [800, 'Medium'], [1000, 'Large']];

/** Apply a content item's appearance settings to its player root. */
export function applyStyle(el, style = {}) {
  const s = el.style;
  s.setProperty('--rs-accent', style.accent || '#278DDF');
  s.setProperty('--rs-bg', style.bg || '#ffffff');
  s.setProperty('--rs-fg', style.text || '#1d2433');
  s.setProperty('--rs-font', FONTS[style.font] || FONTS.system);
  s.setProperty('--rs-size', `${{ sm: 14, md: 16, lg: 18 }[style.size] || 16}px`);
  s.setProperty('--rs-radius', style.corners === 'square' ? '3px' : style.corners === 'round' ? '16px' : '10px');
  el.classList.add('rs-themed');
}

/** "Appearance" section shared by every content type. */
export function styleEditor(data, onChange, { defaults = {} } = {}) {
  data.style ||= {};
  const st = data.style;
  for (const [k, v] of Object.entries({ accent: '#278DDF', bg: '#FFFFFF', text: '#1D2433', font: 'system', size: 'md', corners: 'rounded', width: 800, ...defaults })) if (st[k] === undefined) st[k] = v;
  const widthObj = { w: String(st.width) };
  return h('div', {},
    colorField('Accent colour (buttons, markers, highlights)', st, 'accent', onChange),
    h('div', { class: 'field-row' }, colorField('Background', st, 'bg', onChange, { swatches: ['#FFFFFF', '#F4F6FA', '#FFF9EC', '#EEF6FF', '#F1FAF4', '#1D2433', '#193B82'] }),
      colorField('Text', st, 'text', onChange, { swatches: ['#1D2433', '#193B82', '#47587A', '#FFFFFF'] })),
    h('div', { class: 'field-row' },
      selectField('Font', st, 'font', [['system', 'Clean (default)'], ['brand', 'ReachStudio'], ['rounded', 'Rounded'], ['serif', 'Classic serif'], ['mono', 'Typewriter']], onChange),
      selectField('Text size', st, 'size', [['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']], onChange)),
    h('div', { class: 'field-row' },
      segmentField('Corners', st, 'corners', [['square', 'Square'], ['rounded', 'Rounded'], ['round', 'Extra round']], onChange, { showText: true }),
      segmentField('Embed width', widthObj, 'w', EMBED_WIDTHS.map(([v, t]) => [String(v), `${t} · ${v}px`]), () => { st.width = Number(widthObj.w); onChange(); }, { showText: true })));
}

/** Renders children at a fixed width and scales them down to fit (like the real embed). */
export function scaledStage(width) {
  const inner = h('div', { class: 'stage-inner' });
  const outer = h('div', { class: 'stage' }, inner);
  let w = width;
  const update = () => {
    const avail = outer.clientWidth || w;
    const scale = Math.min(1, avail / w);
    inner.style.width = `${w}px`;
    inner.style.transform = `scale(${scale})`;
    inner.style.left = `${Math.max(0, (avail - w * scale) / 2)}px`;
    outer.style.height = `${Math.ceil(inner.offsetHeight * scale)}px`;
    outer.dataset.scale = scale.toFixed(2);
  };
  const ro = new ResizeObserver(update);
  ro.observe(outer); ro.observe(inner);
  return { el: outer, inner, setWidth(n) { w = n; update(); }, update };
}

// ---------------- player helpers ----------------

/**
 * Renders a single choice / multiple choice question and returns
 * { el, check(): boolean|null (null = nothing selected), reset() }.
 */
export function choiceQuestion(q, { shuffleOptions = false, onAnswered } = {}) {
  const correctCount = q.options.filter((o) => o.correct).length;
  const multi = correctCount > 1;
  const opts = (shuffleOptions ? shuffle(q.options.map((o, i) => ({ ...o, i }))) : q.options.map((o, i) => ({ ...o, i }))).filter((o) => o.text?.trim() || o.correct);
  const selected = new Set();
  let locked = false;
  const buttons = opts.map((o) => {
    const b = h('button', { class: `rs-option ${multi ? 'multi' : ''}`, type: 'button', 'aria-pressed': 'false',
      onclick: () => {
        if (locked) return;
        if (!multi) { selected.clear(); buttons.forEach((x) => { x.classList.remove('selected'); x.setAttribute('aria-pressed', 'false'); }); }
        if (selected.has(o.i)) selected.delete(o.i); else selected.add(o.i);
        b.classList.toggle('selected', selected.has(o.i)); b.setAttribute('aria-pressed', String(selected.has(o.i)));
        onAnswered?.();
      } }, h('span', { class: 'mark', 'aria-hidden': 'true' }, icon('check', { size: 13, stroke: 3 })), h('span', {}, o.text));
    b._o = o;
    return b;
  });
  const el = h('div', { class: 'rs-question' },
    !isBlank(q.text) && h('div', { class: 'rs-question-text rs-text', html: richHtml(q.text) }),
    q.image && safeUrl(q.image) && h('img', { class: 'rs-question-img', src: safeUrl(q.image), alt: '' }),
    multi && h('p', { class: 'rs-status' }, 'Select all that apply.'),
    h('div', { class: 'rs-options', role: 'group' }, buttons));
  return {
    el,
    hasAnswer: () => selected.size > 0,
    check() {
      if (!selected.size) return null;
      locked = true;
      let ok = true;
      buttons.forEach((b) => {
        b.disabled = true;
        const isSel = selected.has(b._o.i);
        if (b._o.correct) b.classList.add('correct');
        if (isSel && !b._o.correct) { b.classList.add('wrong'); b.querySelector('.mark').replaceChildren(icon('x', { size: 13, stroke: 3 })); ok = false; }
        if (!isSel && b._o.correct) ok = false;
      });
      return ok;
    },
    reset() { locked = false; selected.clear(); buttons.forEach((b) => { b.disabled = false; b.className = `rs-option ${multi ? 'multi' : ''}`; }); },
  };
}

export const feedback = (ok, good = 'Correct!', bad = 'Not quite.') =>
  h('div', { class: `rs-feedback ${ok ? 'good' : 'bad'}`, role: 'status' }, icon(ok ? 'check' : 'x', { size: 16, stroke: 3 }), h('span', { class: 'rs-text', html: richHtml(ok ? good : bad) }));

/**
 * Pointer-based drag & drop with click-to-place fallback (touch + keyboard friendly).
 * onDrop(itemEl, targetEl) called when an item is dropped/placed on a [data-drop] target.
 */
// ---------------- drag and drop ----------------
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// How much an element is scaled on screen (the builder preview shrinks content with a transform).
const screenScale = (el) => { const w = el.offsetWidth; return w ? el.getBoundingClientRect().width / w : 1; };

/**
 * Animates elements from where they were to wherever `mutate` puts them (FLIP).
 * `from` can override the starting rectangle of particular elements (e.g. the drag ghost).
 */
export function flipMove(els, mutate, from = new Map()) {
  const before = new Map(els.map((el) => [el, from.get(el) || el.getBoundingClientRect()]));
  mutate();
  if (reduceMotion()) return;
  els.forEach((el) => {
    const a = before.get(el); const b = el.getBoundingClientRect();
    const dx = a.left - b.left; const dy = a.top - b.top;
    if (!el.isConnected || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) return;
    const k = screenScale(el) || 1;
    el.animate([{ transform: `translate(${dx / k}px, ${dy / k}px)` }, { transform: 'none' }],
      { duration: from.has(el) ? 220 : 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}

/**
 * Drag-and-drop for players: `.rs-drag` items onto `[data-drop]` targets inside root.
 * Works with mouse, touch and pen (drag, or tap an item then tap a target) and the keyboard
 * (Enter/Space to pick up and to drop). Moves animate smoothly; a drop outside any target
 * glides the item back to where it came from.
 */
export function dragSystem(root, { onDrop }) {
  let picked = null;
  const targets = () => [...root.querySelectorAll('[data-drop]')];
  const clearPick = () => { picked?.classList.remove('picked'); picked = null; root.classList.remove('rs-picking'); targets().forEach((t) => t.classList.remove('target')); };
  const pick = (el) => { clearPick(); picked = el; el.classList.add('picked'); root.classList.add('rs-picking'); targets().forEach((t) => t.classList.add('target')); };
  const place = (el, target, from) => flipMove([...root.querySelectorAll('.rs-drag')], () => onDrop(el, target), from);

  root.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('.rs-drag');
    if (!item || !root.contains(item) || root.dataset.locked || e.button > 0) return;
    e.preventDefault(); // no text selection or touch scrolling while dragging
    const start = item.getBoundingClientRect();
    const k = screenScale(item) || 1;
    const offX = e.clientX - start.left; const offY = e.clientY - start.top;
    let layer = null; let over = null; let last = e; let raf = 0;
    try { item.setPointerCapture(e.pointerId); } catch { /* not supported */ }

    const lift = () => {
      clearPick();
      // The copy lives on <body>: inside the player a fixed element would be positioned
      // relative to the content box (container queries), not the window.
      const src = item.closest('.rs') || root; const cs = getComputedStyle(src);
      layer = h('div', { class: 'rs-drag-layer', 'aria-hidden': 'true' });
      ['--rs-accent', '--rs-bg', '--rs-fg', '--rs-radius', '--rs-font'].forEach((v) => layer.style.setProperty(v, cs.getPropertyValue(v)));
      Object.assign(layer.style, { fontFamily: cs.fontFamily, fontSize: cs.fontSize, color: cs.color, width: `${item.offsetWidth}px`, transform: `scale(${k})` });
      const ghost = item.cloneNode(true); ghost.classList.remove('picked'); ghost.classList.add('rs-ghost');
      ghost.style.width = `${item.offsetWidth}px`;
      layer.append(ghost); document.body.append(layer);
      item.classList.add('rs-dragging'); root.classList.add('rs-is-dragging');
      targets().forEach((t) => t.classList.add('target'));
    };
    const position = () => { layer.style.left = `${last.clientX - offX}px`; layer.style.top = `${last.clientY - offY}px`; };
    const autoScroll = () => { // keep dragging when the target is just off-screen
      raf = 0; if (!layer) return;
      const edge = 40; const y = last.clientY; const dy = y < edge ? -(edge - y) : y > innerHeight - edge ? y - (innerHeight - edge) : 0;
      if (dy) { scrollBy(0, dy / 3); raf = requestAnimationFrame(autoScroll); }
    };
    const move = (ev) => {
      last = ev;
      if (!layer && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
      if (!layer) lift();
      position();
      const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop]');
      const next = t && root.contains(t) ? t : null;
      if (next !== over) { over?.classList.remove('over'); over = next; over?.classList.add('over'); }
      if (!raf) raf = requestAnimationFrame(autoScroll);
    };
    const finish = (ev, cancelled) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
      if (raf) cancelAnimationFrame(raf);
      if (!layer) { if (!cancelled) { if (picked === item) clearPick(); else pick(item); } return; }
      const ghostRect = layer.firstChild.getBoundingClientRect();
      over?.classList.remove('over'); targets().forEach((t) => t.classList.remove('target'));
      root.classList.remove('rs-is-dragging');
      const done = () => { layer.remove(); item.classList.remove('rs-dragging'); };
      if (over && !cancelled) { done(); place(item, over, new Map([[item, ghostRect]])); return; }
      // Dropped outside a target: glide back.
      const home = item.getBoundingClientRect();
      if (reduceMotion()) { done(); return; }
      layer.animate([{ left: layer.style.left, top: layer.style.top }, { left: `${home.left}px`, top: `${home.top}px` }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = done;
      layer.firstChild.classList.add('rs-landing');
    };
    const up = (ev) => finish(ev, false);
    const cancel = (ev) => finish(ev, true);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  });
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-drop]');
    if (picked && t && root.contains(t) && !e.target.closest('.rs-drag')) { const p = picked; clearPick(); place(p, t); }
  });
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('rs-drag')) { e.preventDefault(); picked === e.target ? clearPick() : pick(e.target); }
    else if ((e.key === 'Enter' || e.key === ' ') && picked && e.target.matches('[data-drop]')) { e.preventDefault(); const p = picked; clearPick(); place(p, e.target); p.focus(); }
    else if (e.key === 'Escape' && picked) clearPick();
  });
  /** Run a change that moves items (retry, show answers) with the same animation. */
  const animate = (fn) => flipMove([...root.querySelectorAll('.rs-drag')], fn);
  return { clearPick, animate };
}

/** Standard check / retry / solution action row. */
export function actionRow({ onCheck, onRetry, onShow }) {
  const check = h('button', { class: 'btn primary rs-accent-btn', type: 'button', onclick: () => onCheck() }, icon('check', { size: 16 }), h('span', {}, 'Check'));
  const retry = h('button', { class: 'btn hidden', type: 'button', onclick: () => onRetry() }, icon('restore', { size: 16 }), h('span', {}, 'Try again'));
  const show = onShow && h('button', { class: 'btn hidden', type: 'button', onclick: () => onShow() }, icon('eye', { size: 16 }), h('span', {}, 'Show answers'));
  const score = h('span', { class: 'rs-score hidden' });
  return {
    el: h('div', { class: 'rs-actions' }, check, retry, show, score),
    checked(s, max) { check.classList.add('hidden'); retry.classList.remove('hidden'); show?.classList.remove('hidden'); score.classList.remove('hidden'); score.textContent = `${s} / ${max}`; },
    reset() { check.classList.remove('hidden'); retry.classList.add('hidden'); show?.classList.add('hidden'); score.classList.add('hidden'); },
  };
}

/** Empty-state used by players when content hasn't been filled in yet. */
export const emptyState = (iconName, text) => h('div', { class: 'rs-empty' }, icon(iconName, { size: 30 }), h('p', {}, text));
