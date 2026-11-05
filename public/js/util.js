// Shared helpers for the studio and the player. No dependencies.

/** Tiny element builder: h('div', {class:'x', onclick}, child, 'text', [more]) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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

/**
 * Safe rich-ish text: HTML is escaped, then **bold**, _italic_, [link](https://..)
 * and blank-line paragraphs are supported. Used for all author-written text.
 */
export function formatText(src) {
  const paras = String(src ?? '').trim().split(/\n{2,}/);
  return paras.filter(Boolean).map((p) => {
    let s = esc(p);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])_(.+?)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return `<p>${s.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}
export const textBlock = (src, cls = '') => h('div', { class: `rs-text ${cls}`, html: formatText(src) });

/** Media URLs: only allow http(s) and our own /media paths (blocks javascript: etc). */
export function safeUrl(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (s.startsWith('/media/')) return s;
  try { const x = new URL(s); return ['http:', 'https:'].includes(x.protocol) ? x.href : ''; } catch { return ''; }
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Split text with *marked* segments into [{text, marked}] parts. */
export function parseMarked(text) {
  const parts = [];
  const re = /\*([^*\n]+)\*/g;
  let last = 0; let m;
  while ((m = re.exec(text || ''))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), marked: false });
    parts.push({ text: m[1], marked: true });
    last = re.lastIndex;
  }
  if (last < (text || '').length) parts.push({ text: text.slice(last), marked: false });
  return parts;
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
  const t = h('div', { class: `toast ${type}`, role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

export function modal({ title, body, confirm = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); resolve(v); };
    const content = typeof body === 'string' ? h('p', {}, body) : body;
    const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(null); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h3', {}, title), content,
        h('div', { class: 'modal-actions' },
          cancel && h('button', { class: 'btn', onclick: () => close(null) }, cancel),
          h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => close(content.querySelector?.('input,select')?.value ?? true) }, confirm))));
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && e.target.tagName === 'INPUT') close(e.target.value); });
    document.body.append(back);
    (back.querySelector('input,select') || back.querySelector('.btn.primary,.btn.danger'))?.focus();
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
    oninput: (e) => { obj[key] = opts.type === 'number' ? Number(e.target.value) : e.target.value; onChange(); },
  });
  if (opts.multiline) input.value = obj[key] ?? '';
  return h('div', { class: 'field' }, label && h('label', {}, label, input), !label && input, opts.help && h('p', { class: 'help' }, opts.help));
}

export function selectField(label, obj, key, options, onChange, opts = {}) {
  const sel = h('select', { onchange: (e) => { obj[key] = e.target.value; onChange(); opts.after?.(); } },
    options.map(([v, t]) => h('option', { value: v, selected: obj[key] === v }, t)));
  return h('div', { class: 'field' }, h('label', {}, label, sel));
}

export function checkField(label, obj, key, onChange) {
  return h('div', { class: 'field' }, h('label', { class: 'correct-toggle', style: { color: 'var(--text)' } },
    h('input', { type: 'checkbox', checked: !!obj[key], onchange: (e) => { obj[key] = e.target.checked; onChange(); } }), ' ', label));
}

/** Image / media field with upload + URL. ctx.api is required for upload. */
export function mediaField(label, obj, key, onChange, ctx, opts = {}) {
  const accept = opts.accept || 'image/png,image/jpeg,image/gif,image/webp';
  const wrap = h('div', { class: 'image-field' });
  const draw = () => {
    wrap.replaceChildren();
    const url = safeUrl(obj[key]);
    if (url) wrap.append(opts.video ? h('video', { src: url, controls: true, preload: 'metadata' }) : h('img', { src: url, alt: '' }));
    const urlInput = h('input', { type: 'url', placeholder: opts.video ? 'Paste a YouTube or MP4 link…' : 'Paste an image link…', value: obj[key] || '',
      onchange: (e) => { obj[key] = e.target.value.trim(); onChange(); draw(); } });
    const file = h('input', { type: 'file', accept, class: 'hidden', onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      up.disabled = true; up.textContent = 'Uploading…';
      try { const r = await ctx.api.upload(f); obj[key] = r.url; onChange(); draw(); } catch (err) { toast(err.message, 'error'); up.disabled = false; up.textContent = 'Upload'; }
    } });
    const up = h('button', { class: 'btn sm', type: 'button', onclick: () => file.click() }, 'Upload');
    wrap.append(h('div', { class: 'row' }, urlInput, up, file,
      obj[key] && h('button', { class: 'icon-btn', type: 'button', title: 'Remove', 'aria-label': 'Remove', onclick: () => { obj[key] = ''; onChange(); draw(); } }, '✕')));
  };
  draw();
  return h('div', { class: 'field' }, label && h('label', {}, label), wrap, opts.help && h('p', { class: 'help' }, opts.help));
}

/**
 * Repeatable list editor with add / remove / move / collapse.
 * renderItem(item, index, changed) returns the body element for one item.
 */
export function listEditor({ items, label, itemLabel, create, renderItem, onChange, min = 0, addText = 'Add', startCollapsed = false }) {
  const wrap = h('div', { class: 'list-editor' });
  const collapsed = new WeakSet();
  if (startCollapsed) items.forEach((it) => collapsed.add(it));
  const draw = () => {
    wrap.replaceChildren();
    items.forEach((item, i) => {
      const lab = h('span', { class: 'lbl' }, itemLabel(item, i));
      const changed = () => { lab.textContent = itemLabel(item, i); onChange(); };
      const box = h('div', { class: `list-item ${collapsed.has(item) ? 'collapsed' : ''}` });
      const head = h('div', { class: 'list-item-head', onclick: (e) => {
        if (e.target.closest('button')) return;
        collapsed.has(item) ? collapsed.delete(item) : collapsed.add(item); box.classList.toggle('collapsed');
      } },
      h('span', { 'aria-hidden': 'true' }, '▸'), lab,
      h('button', { class: 'icon-btn', type: 'button', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { items.splice(i - 1, 0, items.splice(i, 1)[0]); onChange(); draw(); } }, '↑'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Move down', 'aria-label': 'Move down', disabled: i === items.length - 1, onclick: () => { items.splice(i + 1, 0, items.splice(i, 1)[0]); onChange(); draw(); } }, '↓'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Delete', 'aria-label': 'Delete', disabled: items.length <= min, onclick: () => { items.splice(i, 1); onChange(); draw(); } }, '🗑'));
      box.append(head, h('div', { class: 'list-item-body' }, renderItem(item, i, changed)));
      wrap.append(box);
    });
    wrap.append(h('button', { class: 'btn sm', type: 'button', onclick: () => { items.push(create()); onChange(); draw(); } }, `+ ${addText}`));
  };
  draw();
  return h('div', { class: 'field' }, label && h('div', { class: 'section-title' }, label), wrap);
}

/** Answer options with "correct" toggles. multi=false makes it single-answer. */
export function optionsEditor(q, onChange, { multi = true, fixed = false } = {}) {
  const wrap = h('div');
  const draw = () => {
    wrap.replaceChildren();
    q.options.forEach((o, i) => {
      wrap.append(h('div', { class: 'option-row' },
        h('input', { type: 'text', value: o.text, placeholder: `Answer ${i + 1}`, disabled: fixed, oninput: (e) => { o.text = e.target.value; onChange(); } }),
        h('label', { class: 'correct-toggle' },
          h('input', { type: multi ? 'checkbox' : 'radio', name: `c${q._k ||= Math.random().toString(36).slice(2)}`, checked: !!o.correct,
            onchange: (e) => { if (!multi) q.options.forEach((x) => { x.correct = false; }); o.correct = e.target.checked; onChange(); } }), 'Correct'),
        !fixed && h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove answer', disabled: q.options.length <= 2, onclick: () => { q.options.splice(i, 1); onChange(); draw(); } }, '✕')));
    });
    if (!fixed) wrap.append(h('button', { class: 'btn sm', type: 'button', onclick: () => { q.options.push({ text: '', correct: false }); onChange(); draw(); } }, '+ Answer'));
  };
  draw();
  return h('div', { class: 'field' }, h('label', {}, 'Answers'), wrap);
}

// ---------------- player helpers ----------------

/**
 * Renders a single choice / multiple choice question and returns
 * { el, check(): boolean|null (null = nothing selected), reset() }.
 */
export function choiceQuestion(q, { shuffleOptions = false, onAnswered } = {}) {
  const correctCount = q.options.filter((o) => o.correct).length;
  const multi = correctCount > 1;
  const opts = shuffleOptions ? shuffle(q.options.map((o, i) => ({ ...o, i }))) : q.options.map((o, i) => ({ ...o, i }));
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
      } }, h('span', { class: 'mark', 'aria-hidden': 'true' }), h('span', {}, o.text));
    b._o = o;
    return b;
  });
  const el = h('div', {},
    q.text && h('div', { class: 'rs-question-text', html: formatText(q.text) }),
    q.image && safeUrl(q.image) && h('img', { src: safeUrl(q.image), alt: '', style: { maxWidth: '100%', maxHeight: '260px', borderRadius: '8px', marginBottom: '10px' } }),
    multi && h('p', { class: 'rs-status', style: { margin: '0 0 8px' } }, 'Select all that apply.'),
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
        if (isSel && !b._o.correct) { b.classList.add('wrong'); ok = false; }
        if (!isSel && b._o.correct) ok = false;
      });
      return ok;
    },
    reset() { locked = false; selected.clear(); buttons.forEach((b) => { b.disabled = false; b.className = `rs-option ${multi ? 'multi' : ''}`; }); },
  };
}

export const feedback = (ok, good = 'Correct!', bad = 'Not quite.') =>
  h('div', { class: `rs-feedback ${ok ? 'good' : 'bad'}`, role: 'status' }, ok ? `✓ ${good}` : `✗ ${bad}`);

/**
 * Pointer-based drag & drop with click-to-place fallback (touch + keyboard friendly).
 * items: draggable elements; targets(): current drop target elements;
 * onDrop(itemEl, targetEl) called when an item is dropped/placed on a target.
 */
export function dragSystem(root, { onDrop }) {
  let picked = null;
  const targets = () => [...root.querySelectorAll('[data-drop]')];
  const clearPick = () => { picked?.classList.remove('picked'); picked = null; targets().forEach((t) => t.classList.remove('target')); };
  const pick = (el) => { clearPick(); picked = el; el.classList.add('picked'); targets().forEach((t) => t.classList.add('target')); };

  root.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('.rs-drag');
    if (!item || root.dataset.locked || e.button > 0) return;
    const sx = e.clientX; const sy = e.clientY; let ghost = null; let over = null;
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!ghost) {
        clearPick();
        ghost = item.cloneNode(true);
        Object.assign(ghost.style, { position: 'fixed', pointerEvents: 'none', zIndex: 999, opacity: .9, margin: 0 });
        document.body.append(ghost); item.style.opacity = '.35';
      }
      ghost.style.left = `${ev.clientX - ghost.offsetWidth / 2}px`; ghost.style.top = `${ev.clientY - ghost.offsetHeight / 2}px`;
      const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop]');
      if (t !== over) { over?.classList.remove('over'); over = t && root.contains(t) ? t : null; over?.classList.add('over'); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (ghost) { ghost.remove(); item.style.opacity = ''; over?.classList.remove('over'); if (over) onDrop(item, over); }
      else if (picked === item) clearPick(); else pick(item);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-drop]');
    if (picked && t && !e.target.closest('.rs-drag')) { const p = picked; clearPick(); onDrop(p, t); }
  });
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('rs-drag')) { e.preventDefault(); picked === e.target ? clearPick() : pick(e.target); }
    else if ((e.key === 'Enter' || e.key === ' ') && picked && e.target.matches('[data-drop]')) { e.preventDefault(); const p = picked; clearPick(); onDrop(p, e.target); }
  });
  return { clearPick };
}

/** Standard check / retry / solution action row. */
export function actionRow({ onCheck, onRetry, onShow }) {
  const check = h('button', { class: 'btn primary', type: 'button', onclick: () => onCheck() }, 'Check');
  const retry = h('button', { class: 'btn hidden', type: 'button', onclick: () => onRetry() }, 'Retry');
  const show = onShow && h('button', { class: 'btn hidden', type: 'button', onclick: () => onShow() }, 'Show solution');
  const score = h('span', { class: 'rs-score hidden' });
  return {
    el: h('div', { class: 'rs-actions' }, check, retry, show, score),
    checked(s, max) { check.classList.add('hidden'); retry.classList.remove('hidden'); show?.classList.remove('hidden'); score.classList.remove('hidden'); score.textContent = `${s} / ${max}`; },
    reset() { check.classList.remove('hidden'); retry.classList.add('hidden'); show?.classList.add('hidden'); score.classList.add('hidden'); },
  };
}
