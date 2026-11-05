// Reach Studio single-page app: account, library, type gallery, builder, embed.
import { h, makeApi, toast, modal, textField } from './util.js';
import { TYPES, TYPE_LIST } from './types/index.js';

const BOOT = window.BOOT || {};
const store = {
  get: () => { try { return sessionStorage.getItem('rs_token'); } catch { return null; } },
  set: (t) => { try { sessionStorage.setItem('rs_token', t); } catch { /* storage unavailable */ } },
};
const state = {
  token: BOOT.token || store.get() || '',
  me: null, folders: [], contents: [],
  filter: { folder: 'all', q: '', type: '' },
  dirty: false,
};
if (BOOT.token) store.set(BOOT.token);
const api = makeApi(() => state.token);
const app = document.getElementById('app');
const inFrame = window.self !== window.top;

const PLACEMENT_TEXT = {
  editor_button: 'Choose or create content to insert into your page, quiz or assignment.',
  assignment_selection: 'Choose or create an activity for this assignment. Scored activities send grades to the gradebook automatically.',
  link_selection: 'Choose or create an activity to add to this module.',
};

window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', () => route());

async function boot() {
  if (!state.token) return renderAuth();
  try {
    state.me = await api.get('/api/me');
  } catch (e) {
    if (e.status === 401) { state.token = ''; return renderAuth(); }
    throw e;
  }
  if (!state.me.user) return renderAuth();
  await loadLibrary();
  route();
}

async function loadLibrary() {
  [state.folders, state.contents] = await Promise.all([api.get('/api/folders'), api.get('/api/contents')]);
}

function route() {
  const [view, arg] = location.hash.replace(/^#/, '').split('/');
  if (!state.me?.user) return renderAuth();
  if (view === 'new' && arg && TYPES[arg]) return renderBuilder({ type: arg, title: '', folderId: libraryFolderForNew(), data: TYPES[arg].defaults() });
  if (view === 'new') return renderPicker();
  if (view === 'edit' && arg) return openEditor(arg);
  return renderLibrary();
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
const libraryFolderForNew = () => (['all', 'none'].includes(state.filter.folder) ? null : state.filter.folder);

// ---------------- layout ----------------
function topbar() {
  const u = state.me?.user;
  const l = state.me?.lti;
  const initials = (u?.name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('img', { src: '/img/icon.svg', alt: '' }), BOOT.toolName || 'Reach Studio'),
    l?.context && h('span', { class: 'ctx' }, `· ${l.context}`),
    h('div', { class: 'spacer' }),
    u && inFrame && h('button', { class: 'btn ghost sm', type: 'button', title: 'Open your library in a full browser tab', onclick: openInNewTab }, '↗ Full screen'),
    u && h('div', { class: 'user-chip' }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials), h('span', {}, u.name),
      h('button', { class: 'btn ghost sm', type: 'button', onclick: signOut }, 'Sign out')));
}

function banner() {
  const l = state.me?.lti;
  if (!l?.canEmbed) return null;
  return h('div', { class: 'banner' }, h('strong', {}, 'Insert mode:'), PLACEMENT_TEXT[l.placement] || PLACEMENT_TEXT.editor_button);
}

async function openInNewTab() {
  try {
    const { token } = await api.post('/api/session/handoff');
    window.open(`/studio?t=${encodeURIComponent(token)}${location.hash}`, '_blank', 'noopener');
  } catch (e) { toast(e.message, 'error'); }
}

async function signOut() {
  const linked = state.me?.lti;
  const ok = await modal({ title: 'Sign out?', body: linked ? 'This unlinks Reach Studio from your ReachLMS login on this site. You can sign in again at any time — your content stays in your account.' : 'You will need your email and password to sign back in.', confirm: 'Sign out' });
  if (!ok) return;
  await api.post('/api/auth/logout').catch(() => {});
  state.me.user = null;
  if (!linked) { state.token = ''; store.set(''); }
  renderAuth();
}

// ---------------- auth (create account / sign in) ----------------
function renderAuth(mode = 'signup') {
  const l = state.me?.lti;
  const fields = { name: l?.name || '', email: l?.email || '', password: '' };
  const err = h('p', { class: 'error hidden', role: 'alert' });
  const submit = async (e) => {
    e.preventDefault();
    err.classList.add('hidden');
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await api.post(mode === 'signup' ? '/api/auth/signup' : '/api/auth/login', fields);
      state.token = r.token; store.set(r.token);
      state.me = await api.get('/api/me');
      await loadLibrary();
      toast(mode === 'signup' ? `Welcome, ${r.user.name}! Your account is ready.` : `Welcome back, ${r.user.name}.`);
      route();
    } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); btn.disabled = false; }
  };
  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    h('button', { class: mode === 'signup' ? 'active' : '', type: 'button', role: 'tab', 'aria-selected': String(mode === 'signup'), onclick: () => renderAuth('signup') }, 'Create account'),
    h('button', { class: mode === 'login' ? 'active' : '', type: 'button', role: 'tab', 'aria-selected': String(mode === 'login'), onclick: () => renderAuth('login') }, 'Sign in'));
  const form = h('form', { onsubmit: submit },
    mode === 'signup' && textField('Your name', fields, 'name', () => {}),
    textField('Email', fields, 'email', () => {}, { type: 'email' }),
    textField('Password', fields, 'password', () => {}, { type: 'password', help: mode === 'signup' ? 'At least 8 characters.' : '' }),
    err,
    h('button', { class: 'btn primary', type: 'submit', style: { justifyContent: 'center', padding: '10px' } }, mode === 'signup' ? 'Create my account' : 'Sign in'));
  form.querySelector('input[type=password]').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  app.replaceChildren(topbar(), h('div', { class: 'auth-wrap' }, h('div', { class: 'auth-card' },
    h('h1', {}, mode === 'signup' ? 'Create your studio account' : 'Sign in to your studio'),
    h('p', { class: 'sub' }, 'Build interactive content once, keep it organised, and embed it anywhere in ReachLMS.'),
    l && h('div', { class: 'linked-note' }, h('span', { 'aria-hidden': 'true' }, '🔗'),
      h('span', {}, 'Your account will be linked to your ReachLMS login', l.platformName ? ` at ${l.platformName}` : '', '. Next time, the studio opens straight away.')),
    !state.token && h('div', { class: 'linked-note' }, h('span', {}, 'Opened outside ReachLMS — sign in to manage your library. To insert content, open Reach Studio from the editor in ReachLMS.')),
    tabs, form)));
  form.querySelector('input')?.focus();
}

// ---------------- library ----------------
function renderLibrary() {
  state.dirty = false;
  const f = state.filter;
  const sidebar = h('nav', { class: 'sidebar', 'aria-label': 'Folders' },
    navItem('📚 All content', 'all', state.contents.length),
    navItem('🗂️ Unfiled', 'none'),
    h('h3', {}, 'Folders', h('button', { class: 'icon-btn', type: 'button', title: 'New folder', 'aria-label': 'New folder', onclick: newFolder }, '+')),
    state.folders.map((fo) => navItem(`📁 ${fo.name}`, fo.id, fo.count, fo)),
    !state.folders.length && h('p', { class: 'help', style: { margin: '0 10px' } }, 'Create folders to organise your content by course or topic.'));

  const search = h('input', { type: 'search', placeholder: 'Search titles…', value: f.q, 'aria-label': 'Search', oninput: debounce((e) => { f.q = e.target.value; refresh(); }, 250) });
  const typeSel = h('select', { 'aria-label': 'Filter by type', onchange: (e) => { f.type = e.target.value; refresh(); } },
    h('option', { value: '' }, 'All types'), TYPE_LIST.map((t) => h('option', { value: t.id, selected: f.type === t.id }, t.name)));
  const grid = h('div');
  const title = f.folder === 'all' ? 'All content' : f.folder === 'none' ? 'Unfiled' : state.folders.find((x) => x.id === f.folder)?.name || 'Folder';
  const main = h('section', { class: 'main' },
    h('div', { class: 'main-head' }, h('h2', {}, title), search, typeSel, h('button', { class: 'btn primary', type: 'button', onclick: () => go('#new') }, '+ Create new')),
    grid);

  const drawGrid = (items) => {
    if (!items.length) {
      grid.replaceChildren(h('div', { class: 'empty' }, h('div', { style: { fontSize: '40px' } }, '✨'),
        h('h3', {}, state.contents.length ? 'Nothing matches here' : 'Build your first interactive'),
        h('p', {}, state.contents.length ? 'Try another folder or search.' : 'Hotspot images, slides, interactive video, quizzes and more — ready to embed in ReachLMS.'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => go('#new') }, '+ Create new')));
      return;
    }
    grid.replaceChildren(h('div', { class: 'grid' }, items.map(card)));
  };
  const refresh = async () => {
    const qs = new URLSearchParams();
    if (f.folder !== 'all') qs.set('folder', f.folder);
    if (f.q) qs.set('q', f.q);
    if (f.type) qs.set('type', f.type);
    try { drawGrid(await api.get(`/api/contents?${qs}`)); } catch (e) { toast(e.message, 'error'); }
  };
  app.replaceChildren(topbar(), banner() || '', h('div', { class: 'library' }, sidebar, main));
  if (f.folder === 'all' && !f.q && !f.type) drawGrid(state.contents); else refresh();
}

function navItem(label, id, count, folder) {
  return h('button', { class: `nav-item ${state.filter.folder === id ? 'active' : ''}`, type: 'button', onclick: () => { state.filter.folder = id; renderLibrary(); } },
    h('span', {}, label),
    folder && h('span', { class: 'folder-actions' },
      h('span', { class: 'icon-btn', role: 'button', title: 'Rename', onclick: (e) => { e.stopPropagation(); renameFolder(folder); } }, '✎'),
      h('span', { class: 'icon-btn', role: 'button', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteFolder(folder); } }, '🗑')),
    count !== undefined && h('span', { class: 'count' }, count));
}

function card(c) {
  const t = TYPES[c.type] || { name: c.type, icon: '❔', color: '#888' };
  const canEmbed = state.me.lti?.canEmbed;
  const folder = state.folders.find((f) => f.id === c.folderId);
  return h('article', { class: 'card' },
    h('div', { class: 'thumb', style: { background: t.color } }, h('span', { 'aria-hidden': 'true' }, t.icon), h('span', { class: 'type-tag' }, t.name)),
    h('div', { class: 'body' }, h('h4', { class: 'title' }, c.title),
      h('div', { class: 'meta' }, `Updated ${timeAgo(c.updatedAt)}`, folder ? ` · 📁 ${folder.name}` : '')),
    h('div', { class: 'actions' },
      canEmbed ? h('button', { class: 'btn primary sm', type: 'button', onclick: () => embed(c.id) }, 'Insert') : null,
      h('button', { class: 'btn sm', type: 'button', onclick: () => go(`#edit/${c.id}`) }, 'Edit'),
      h('span', { class: 'grow' }),
      h('button', { class: 'icon-btn', type: 'button', title: 'Preview', 'aria-label': `Preview ${c.title}`, onclick: () => preview(c.id) }, '👁'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Duplicate', 'aria-label': `Duplicate ${c.title}`, onclick: () => duplicate(c) }, '⧉'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Move to folder', 'aria-label': `Move ${c.title}`, onclick: () => move(c) }, '📁'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Delete', 'aria-label': `Delete ${c.title}`, onclick: () => remove(c) }, '🗑')));
}

async function newFolder() {
  const name = await modal({ title: 'New folder', body: h('div', {}, h('input', { type: 'text', placeholder: 'e.g. Biology – Term 1', maxlength: 80 })), confirm: 'Create' });
  if (!name || typeof name !== 'string') return;
  const fo = await api.post('/api/folders', { name });
  state.folders.push(fo); state.folders.sort((a, b) => a.name.localeCompare(b.name));
  state.filter.folder = fo.id; renderLibrary();
}
async function renameFolder(fo) {
  const name = await modal({ title: 'Rename folder', body: h('div', {}, h('input', { type: 'text', value: fo.name, maxlength: 80 })), confirm: 'Save' });
  if (!name || typeof name !== 'string') return;
  await api.patch(`/api/folders/${fo.id}`, { name }); fo.name = name; renderLibrary();
}
async function deleteFolder(fo) {
  if (!await modal({ title: `Delete "${fo.name}"?`, body: 'The folder is removed. Its content is kept and moved to Unfiled.', confirm: 'Delete folder', danger: true })) return;
  await api.del(`/api/folders/${fo.id}`);
  if (state.filter.folder === fo.id) state.filter.folder = 'all';
  await loadLibrary(); renderLibrary();
}
async function duplicate(c) {
  await api.post(`/api/contents/${c.id}/duplicate`); await loadLibrary(); renderLibrary(); toast('Copy created');
}
async function move(c) {
  const sel = h('select', {}, h('option', { value: '' }, 'Unfiled'), state.folders.map((f) => h('option', { value: f.id, selected: f.id === c.folderId }, f.name)));
  const v = await modal({ title: `Move "${c.title}"`, body: h('div', {}, h('label', {}, 'Folder', sel)), confirm: 'Move' });
  if (v === null) return;
  await api.put(`/api/contents/${c.id}`, { folderId: sel.value || null }); await loadLibrary(); renderLibrary();
}
async function remove(c) {
  if (!await modal({ title: `Delete "${c.title}"?`, body: 'This cannot be undone. Anywhere this content is embedded in ReachLMS will show "Content not found".', confirm: 'Delete', danger: true })) return;
  await api.del(`/api/contents/${c.id}`); await loadLibrary(); renderLibrary(); toast('Deleted');
}

async function preview(id) {
  const c = await api.get(`/api/contents/${id}`);
  const t = TYPES[c.type];
  const box = h('div', { class: 'player-root rs' });
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) back.remove(); } },
    h('div', { class: 'modal', style: { maxWidth: '960px', maxHeight: '92vh', overflow: 'auto' } },
      h('div', { class: 'preview-label' }, h('span', {}, `Preview · ${t.name}`), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close preview', onclick: () => back.remove() }, '✕')),
      h('h3', {}, c.title), box,
      state.me.lti?.canEmbed && h('div', { class: 'modal-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => embed(c.id) }, 'Insert this'))));
  box.append(t.render(c.data, { report: (s, m) => toast(`Preview score: ${s} / ${m} (not recorded)`), preview: true }));
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') back.remove(); });
  document.body.append(back);
}

// ---------------- type picker ----------------
function renderPicker() {
  app.replaceChildren(topbar(), banner() || '', h('section', { class: 'main' },
    h('div', { class: 'main-head' }, h('button', { class: 'btn', type: 'button', onclick: () => go('#') }, '← Library'), h('h2', {}, 'What would you like to create?')),
    h('div', { class: 'type-grid' }, TYPE_LIST.map((t) => h('button', { class: 'type-card', type: 'button', onclick: () => go(`#new/${t.id}`) },
      h('span', { class: 'ticon', style: { background: t.color }, 'aria-hidden': 'true' }, t.icon),
      h('span', {}, h('h4', {}, t.name), h('p', {}, t.description), t.graded && h('span', { class: 'graded' }, 'Can be graded')))))));
}

// ---------------- builder ----------------
async function openEditor(id) {
  try {
    const c = await api.get(`/api/contents/${id}`);
    renderBuilder({ id: c.id, type: c.type, title: c.title, folderId: c.folderId, data: c.data });
  } catch (e) { toast(e.message, 'error'); go('#'); }
}

function renderBuilder(doc) {
  const t = TYPES[doc.type];
  state.dirty = !doc.id;
  const dirtyEl = h('span', { class: 'dirty' }, state.dirty ? 'Not saved yet' : '');
  const markDirty = () => { state.dirty = true; dirtyEl.textContent = 'Unsaved changes'; };
  const previewBox = h('div', { class: 'rs' });
  const drawPreview = () => {
    previewBox.replaceChildren();
    try { previewBox.append(t.render(JSON.parse(JSON.stringify(doc.data)), { report: (s, m) => toast(`Preview score: ${s} / ${m} (not recorded)`), preview: true })); }
    catch (e) { console.error(e); previewBox.append(h('div', { class: 'rs-empty' }, 'Preview unavailable — keep editing.')); }
  };
  const schedulePreview = debounce(drawPreview, 350);
  const ctx = { api, onChange: () => { markDirty(); schedulePreview(); } };

  const titleInput = h('input', { class: 'title-input', type: 'text', value: doc.title, placeholder: `Untitled ${t.name}`, 'aria-label': 'Title', maxlength: 200, oninput: (e) => { doc.title = e.target.value; markDirty(); } });
  const folderSel = h('select', { 'aria-label': 'Folder', onchange: (e) => { doc.folderId = e.target.value || null; markDirty(); } },
    h('option', { value: '' }, 'Unfiled'), state.folders.map((f) => h('option', { value: f.id, selected: f.id === doc.folderId }, `📁 ${f.name}`)));

  const save = async () => {
    if (!doc.title.trim()) { titleInput.focus(); toast('Please add a title first.', 'error'); return null; }
    try {
      const body = { type: doc.type, title: doc.title, folderId: doc.folderId, data: doc.data };
      const saved = doc.id ? await api.put(`/api/contents/${doc.id}`, body) : await api.post('/api/contents', body);
      const wasNew = !doc.id;
      doc.id = saved.id; state.dirty = false; dirtyEl.textContent = 'Saved ✓';
      if (wasNew) history.replaceState(null, '', `#edit/${saved.id}`);
      loadLibrary().catch(() => {});
      return saved;
    } catch (e) { toast(e.message, 'error'); return null; }
  };
  const canEmbed = state.me.lti?.canEmbed;
  const back = async () => {
    if (state.dirty && !await modal({ title: 'Leave without saving?', body: 'Your unsaved changes will be lost.', confirm: 'Leave', danger: true })) return;
    state.dirty = false; go('#');
  };

  app.replaceChildren(topbar(), banner() || '',
    h('div', { class: 'builder-bar' },
      h('button', { class: 'btn', type: 'button', onclick: back }, '← Library'),
      h('span', { class: 'ticon', title: t.name, style: { fontSize: '20px' } }, t.icon),
      titleInput, folderSel, dirtyEl,
      h('button', { class: `btn ${canEmbed ? '' : 'primary'}`, type: 'button', onclick: async () => { if (await save()) toast('Saved'); } }, 'Save'),
      canEmbed && h('button', { class: 'btn primary', type: 'button', onclick: async () => { const s = await save(); if (s) embed(s.id); } }, 'Save & insert')),
    h('div', { class: 'builder' },
      h('section', { class: 'editor-pane', 'aria-label': 'Editor' }, h('p', { class: 'help', style: { marginTop: 0 } }, t.description), t.editor(doc.data, ctx)),
      h('section', { class: 'preview-pane', 'aria-label': 'Live preview' },
        h('div', { class: 'preview-label' }, h('span', {}, 'Live preview'), h('span', {}, 'What learners will see')),
        h('div', { class: 'preview-frame' }, previewBox))));
  drawPreview();
  if (!doc.title) titleInput.focus();
}

// ---------------- embed (LTI deep linking response) ----------------
async function embed(contentId) {
  if (state.dirty && !await modal({ title: 'Insert without saving?', body: 'Unsaved changes will not be included.', confirm: 'Insert anyway' })) return;
  try {
    const { returnUrl, jwt } = await api.post('/api/embed', { contentId });
    state.dirty = false;
    app.replaceChildren(h('div', { class: 'loading' }, 'Inserting into ReachLMS…'));
    const form = h('form', { method: 'post', action: returnUrl }, h('input', { type: 'hidden', name: 'JWT', value: jwt }));
    document.body.append(form);
    form.submit();
  } catch (e) { toast(e.message, 'error'); }
}

// ---------------- helpers ----------------
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function timeAgo(s) {
  const d = new Date(`${s.replace(' ', 'T')}Z`);
  const sec = (Date.now() - d) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return d.toLocaleDateString();
}

boot().catch((e) => { console.error(e); app.replaceChildren(h('div', { class: 'center-card' }, h('h1', {}, 'Something went wrong'), h('p', {}, e.message))); });
