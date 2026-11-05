// ReachStudio single-page app: account, library, type gallery, builder, embed and admin view.
import { h, makeApi, toast, modal, textField, iconBtn, styleEditor, scaledStage, clone } from './util.js';
import { icon } from './icons.js';
import { logo } from './brand.js';
import { coverSvg } from './covers.js';
import { TYPES, TYPE_LIST, renderContent } from './types/index.js';

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
const isAdmin = () => state.me?.user?.role === 'admin';

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
  if (state.me.user.status !== 'active') return renderSuspended();
  await loadLibrary();
  route();
}

async function loadLibrary() {
  try {
    [state.folders, state.contents] = await Promise.all([api.get('/api/folders'), api.get('/api/contents')]);
  } catch (e) {
    if (e.data?.suspended) { renderSuspended(); throw e; }
    throw e;
  }
}

function route() {
  const [view, arg] = location.hash.replace(/^#/, '').split('/');
  if (!state.me?.user) return renderAuth();
  if (view === 'new' && arg && TYPES[arg]) return renderBuilder({ type: arg, title: '', folderId: libraryFolderForNew(), data: TYPES[arg].defaults() });
  if (view === 'new') return renderGallery();
  if (view === 'edit' && arg) return openEditor(arg);
  if (view === 'admin' && isAdmin()) return renderAdmin();
  return renderLibrary();
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
const libraryFolderForNew = () => (['all', 'none'].includes(state.filter.folder) ? null : state.filter.folder);
const coverEl = (type, cls = '') => h('div', { class: `cover ${cls}`, html: coverSvg(type) });
const typeChip = (t) => h('span', { class: 'type-chip', style: { '--chip': t.color } }, icon(t.icon, { size: 14 }), t.name);

// ---------------- layout ----------------
function topbar(active = '') {
  const u = state.me?.user;
  const l = state.me?.lti;
  const initials = (u?.name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#', 'aria-label': 'ReachStudio home' }, logo({ variant: 'dark' })),
    u && h('nav', { class: 'tabs-nav', 'aria-label': 'Sections' },
      h('a', { href: '#', class: active === 'library' ? 'on' : '' }, icon('library', { size: 16 }), h('span', {}, 'My content')),
      isAdmin() && h('a', { href: '#admin', class: active === 'admin' ? 'on' : '' }, icon('shield', { size: 16 }), h('span', {}, 'Admin'))),
    h('div', { class: 'spacer' }),
    l?.context && h('span', { class: 'ctx' }, icon('book', { size: 14 }), l.context),
    u && inFrame && h('button', { class: 'btn ghost sm', type: 'button', title: 'Open ReachStudio in a full browser tab', onclick: openInNewTab }, icon('external', { size: 15 }), h('span', { class: 'hide-sm' }, 'Full screen')),
    u && h('div', { class: 'user-chip' },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials),
      h('span', { class: 'who' }, h('span', { class: 'n' }, u.name), h('span', { class: 'r' }, u.role === 'admin' ? 'Admin' : 'Teacher')),
      iconBtn('logout', 'Sign out', signOut, { cls: 'on-dark' })));
}

function banner() {
  const l = state.me?.lti;
  if (!l?.canEmbed) return null;
  return h('div', { class: 'banner' }, icon('insert', { size: 16 }), h('strong', {}, 'Insert mode'), h('span', {}, PLACEMENT_TEXT[l.placement] || PLACEMENT_TEXT.editor_button));
}

async function openInNewTab() {
  try {
    const { token } = await api.post('/api/session/handoff');
    window.open(`/studio?t=${encodeURIComponent(token)}${location.hash}`, '_blank', 'noopener');
  } catch (e) { toast(e.message, 'error'); }
}

async function signOut() {
  const linked = state.me?.lti;
  const ok = await modal({ title: 'Sign out?', body: linked ? 'This unlinks ReachStudio from your ReachLMS login on this site. You can sign in again at any time — your content stays in your account.' : 'You will need your email and password to sign back in.', confirm: 'Sign out' });
  if (!ok) return;
  await api.post('/api/auth/logout').catch(() => {});
  state.me.user = null;
  if (!linked) { state.token = ''; store.set(''); }
  renderAuth();
}

function renderSuspended() {
  app.replaceChildren(h('div', { class: 'auth-wrap' }, h('div', { class: 'auth-card' }, logo({ size: 'lg' }),
    h('h1', {}, 'Account suspended'),
    h('p', { class: 'sub' }, 'Your ReachStudio account has been suspended by an administrator. Content you already embedded in ReachLMS keeps working. Please contact your ReachLMS administrator if you think this is a mistake.'))));
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
    h('button', { class: 'btn primary block', type: 'submit' }, mode === 'signup' ? 'Create my account' : 'Sign in'));
  form.querySelector('input[type=password]').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  app.replaceChildren(h('div', { class: 'auth-wrap' }, h('div', { class: 'auth-card' },
    logo({ size: 'lg' }),
    h('h1', {}, mode === 'signup' ? 'Create your studio account' : 'Welcome back'),
    h('p', { class: 'sub' }, 'Build interactive content once, keep it organised, and embed it anywhere in ReachLMS.'),
    l && h('div', { class: 'note' }, icon('link', { size: 16 }),
      h('span', {}, 'Your account will be linked to your ReachLMS login', l.platformName ? ` at ${l.platformName}` : '', '. Next time, the studio opens straight away.')),
    !state.token && h('div', { class: 'note' }, icon('info', { size: 16 }), h('span', {}, 'Opened outside ReachLMS — sign in to manage your library. To insert content, open ReachStudio from the editor in ReachLMS.')),
    tabs, form)));
  form.querySelector('input')?.focus();
}

// ---------------- library ----------------
function renderLibrary() {
  state.dirty = false;
  const f = state.filter;
  const sidebar = h('nav', { class: 'sidebar', 'aria-label': 'Folders' },
    h('button', { class: 'btn primary block create-btn', type: 'button', onclick: () => go('#new') }, icon('plus', { size: 16 }), h('span', {}, 'Create new')),
    navItem('library', 'All content', 'all', state.contents.length),
    navItem('inbox', 'Unfiled', 'none'),
    h('h3', {}, h('span', {}, 'Folders'), iconBtn('folder-plus', 'New folder', newFolder)),
    state.folders.map((fo) => navItem('folder', fo.name, fo.id, fo.count, fo)),
    !state.folders.length && h('p', { class: 'help side-help' }, 'Create folders to organise content by course or topic.'));

  const search = h('div', { class: 'search' }, icon('search', { size: 16 }), h('input', { type: 'search', placeholder: 'Search titles…', value: f.q, 'aria-label': 'Search', oninput: debounce((e) => { f.q = e.target.value; refresh(); }, 250) }));
  const typeSel = h('select', { 'aria-label': 'Filter by type', onchange: (e) => { f.type = e.target.value; refresh(); } },
    h('option', { value: '' }, 'All types'), TYPE_LIST.map((t) => h('option', { value: t.id, selected: f.type === t.id }, t.name)));
  const grid = h('div');
  const title = f.folder === 'all' ? 'All content' : f.folder === 'none' ? 'Unfiled' : state.folders.find((x) => x.id === f.folder)?.name || 'Folder';
  const main = h('section', { class: 'main' },
    h('div', { class: 'main-head' }, h('h2', {}, title), search, typeSel),
    grid);

  const drawGrid = (items) => {
    if (!items.length) {
      grid.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'empty-ico' }, icon('sparkles', { size: 30 })),
        h('h3', {}, state.contents.length ? 'Nothing matches here' : 'Build your first interactive'),
        h('p', {}, state.contents.length ? 'Try another folder or search.' : 'Hotspot images, slides, interactive video, quizzes and more — ready to embed in ReachLMS.'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => go('#new') }, icon('plus', { size: 16 }), h('span', {}, 'Create new'))));
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
  app.replaceChildren(topbar('library'), banner() || '', h('div', { class: 'library' }, sidebar, main));
  if (f.folder === 'all' && !f.q && !f.type) drawGrid(state.contents); else refresh();
}

function navItem(ic, label, id, count, folder) {
  return h('div', { class: `nav-item ${state.filter.folder === id ? 'active' : ''}` },
    h('button', { type: 'button', class: 'nav-main', onclick: () => { state.filter.folder = id; renderLibrary(); } }, icon(ic, { size: 16 }), h('span', { class: 'nm' }, label), count !== undefined && h('span', { class: 'count' }, count)),
    folder && h('span', { class: 'folder-actions' }, iconBtn('edit', `Rename ${label}`, () => renameFolder(folder)), iconBtn('trash', `Delete ${label}`, () => deleteFolder(folder))));
}

function card(c) {
  const t = TYPES[c.type] || { name: c.type, icon: 'help', color: '#888' };
  const canEmbed = state.me.lti?.canEmbed;
  const folder = state.folders.find((f) => f.id === c.folderId);
  return h('article', { class: 'card' },
    h('button', { class: 'card-cover', type: 'button', 'aria-label': `Preview ${c.title}`, onclick: () => preview(c.id) }, coverEl(c.type), typeChip(t)),
    h('div', { class: 'body' }, h('h4', { class: 'title' }, c.title),
      h('div', { class: 'meta' }, icon('clock', { size: 13 }), `Updated ${timeAgo(c.updatedAt)}`, folder && h('span', { class: 'meta-folder' }, icon('folder', { size: 13 }), folder.name))),
    h('div', { class: 'actions' },
      canEmbed && h('button', { class: 'btn primary sm', type: 'button', onclick: () => embed(c.id) }, icon('insert', { size: 15 }), h('span', {}, 'Insert')),
      h('button', { class: 'btn sm', type: 'button', onclick: () => go(`#edit/${c.id}`) }, icon('edit', { size: 15 }), h('span', {}, 'Edit')),
      h('span', { class: 'grow' }),
      iconBtn('eye', `Preview ${c.title}`, () => preview(c.id)),
      moreMenu(c.title, [
        ['copy', 'Duplicate', () => duplicate(c)],
        ['folder-move', 'Move to folder', () => move(c)],
        ['trash', 'Delete', () => remove(c), 'danger'],
      ])));
}

/** Small "more actions" dropdown. items: [icon, label, fn, cls?] */
function moreMenu(name, items) {
  const menu = h('div', { class: 'menu hidden', role: 'menu' }, items.map(([ic, label, fn, cls]) =>
    h('button', { type: 'button', role: 'menuitem', class: cls || '', onclick: () => { menu.classList.add('hidden'); fn(); } }, icon(ic, { size: 15 }), h('span', {}, label))));
  const btn = iconBtn('more', `More actions for ${name}`, (e) => {
    e.stopPropagation();
    document.querySelectorAll('.menu:not(.hidden)').forEach((m) => m !== menu && m.classList.add('hidden'));
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) menu.querySelector('button')?.focus();
  });
  btn.setAttribute('aria-haspopup', 'menu');
  return h('span', { class: 'menu-wrap' }, btn, menu);
}
document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) document.querySelectorAll('.menu:not(.hidden)').forEach((m) => m.classList.add('hidden')); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.menu:not(.hidden)').forEach((m) => m.classList.add('hidden')); });

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

/** Preview modal: renders at the real embed width, scaled to fit, with device sizes. */
function previewModal(type, title, data, { actions = [], subtitle } = {}) {
  const t = TYPES[type];
  const widths = { embed: data.style?.width || 800, tablet: 768, phone: 390 };
  let device = 'embed';
  const stage = scaledStage(widths.embed);
  const draw = () => { stage.inner.replaceChildren(renderContent(type, clone(data), { report: (s, m) => toast(`Preview score: ${s} / ${m} (not recorded)`), preview: true })); stage.setWidth(widths[device]); };
  const devBtns = deviceToggle((d) => { device = d; draw(); }, () => device, widths);
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) back.remove(); } },
    h('div', { class: 'modal preview-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Preview ${title}` },
      h('div', { class: 'modal-head' }, h('div', {}, h('h3', {}, title), h('p', { class: 'help' }, subtitle || t.name)), devBtns, iconBtn('x', 'Close preview', () => back.remove())),
      h('div', { class: 'preview-frame' }, stage.el),
      actions.length > 0 && h('div', { class: 'modal-actions' }, ...actions.map(([label, ic, fn, cls]) => h('button', { class: `btn ${cls || ''}`, type: 'button', onclick: () => { back.remove(); fn(); } }, icon(ic, { size: 16 }), h('span', {}, label))))));
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') back.remove(); });
  document.body.append(back);
  draw();
  back.querySelector('.icon-btn')?.focus();
}

function deviceToggle(onPick, current, widths) {
  const wrap = h('div', { class: 'segment device-toggle', role: 'radiogroup', 'aria-label': 'Preview size' });
  const draw = () => wrap.replaceChildren(...[['embed', 'monitor', `Embed · ${widths.embed}px`], ['tablet', 'tablet', 'Tablet · 768px'], ['phone', 'phone', 'Phone · 390px']].map(([k, ic, label]) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(current() === k), class: current() === k ? 'on' : '', title: label, 'aria-label': label, onclick: () => { onPick(k); draw(); } }, icon(ic, { size: 16 }))));
  draw();
  return wrap;
}

async function preview(id) {
  const c = await api.get(`/api/contents/${id}`);
  previewModal(c.type, c.title, c.data, {
    actions: [
      ['Edit', 'edit', () => go(`#edit/${c.id}`)],
      ...(state.me.lti?.canEmbed ? [['Insert this', 'insert', () => embed(c.id), 'primary']] : []),
    ],
  });
}

// ---------------- type gallery ----------------
function renderGallery() {
  app.replaceChildren(topbar('library'), banner() || '', h('section', { class: 'main gallery' },
    h('div', { class: 'main-head' }, h('button', { class: 'btn', type: 'button', onclick: () => go('#') }, icon('arrow-left', { size: 16 }), h('span', {}, 'Library')), h('h2', {}, 'What would you like to create?')),
    h('p', { class: 'lead' }, 'Pick a content type. Not sure which one? Open "Learn more" to read what it does and try a working example.'),
    h('div', { class: 'type-grid' }, TYPE_LIST.map((t) => h('article', { class: 'type-card' },
      h('button', { class: 'type-cover', type: 'button', 'aria-label': `Learn more about ${t.name}`, onclick: () => learnMore(t) }, coverEl(t.id)),
      h('div', { class: 'type-body' },
        h('h4', {}, h('span', { class: 'ticon', style: { background: t.color } }, icon(t.icon, { size: 16 })), t.name),
        h('p', {}, t.tagline),
        h('div', { class: 'badges' }, t.graded ? h('span', { class: 'badge graded' }, icon('award', { size: 13 }), 'Can be graded') : h('span', { class: 'badge' }, icon('book', { size: 13 }), 'Not graded'))),
      h('div', { class: 'type-actions' },
        h('button', { class: 'btn primary sm', type: 'button', onclick: () => go(`#new/${t.id}`) }, icon('plus', { size: 15 }), h('span', {}, 'Create')),
        h('button', { class: 'btn sm', type: 'button', onclick: () => learnMore(t) }, icon('info', { size: 15 }), h('span', {}, 'Learn more'))))))));
}

function learnMore(t) {
  const ex = t.example();
  const a = t.about;
  const widths = { embed: 800, tablet: 768, phone: 390 };
  let device = 'embed';
  const stage = scaledStage(800);
  const draw = () => { stage.inner.replaceChildren(renderContent(t.id, clone(ex.data), { report: (s, m) => toast(`Example score: ${s} / ${m}`), preview: true })); stage.setWidth(widths[device]); };
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) back.remove(); } },
    h('div', { class: 'modal learn-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t.name },
      h('div', { class: 'modal-head' }, h('div', { class: 'learn-title' }, h('span', { class: 'ticon lg', style: { background: t.color } }, icon(t.icon, { size: 20 })), h('div', {}, h('h3', {}, t.name), h('p', { class: 'help' }, t.tagline))), iconBtn('x', 'Close', () => back.remove())),
      h('div', { class: 'learn-body' },
        h('div', { class: 'learn-text' },
          h('p', { class: 'summary' }, a.summary),
          h('h5', {}, 'Good for'), h('ul', {}, a.uses.map((u) => h('li', {}, u))),
          h('h5', {}, 'What learners do'), h('p', {}, a.learners),
          h('div', { class: 'tip' }, icon('sparkles', { size: 16 }), h('div', {}, h('strong', {}, 'Tip: '), a.tip)),
          h('p', { class: 'badges' }, t.graded ? h('span', { class: 'badge graded' }, icon('award', { size: 13 }), 'Can send a score to the ReachLMS gradebook when added as an assignment') : h('span', { class: 'badge' }, icon('book', { size: 13 }), 'For learning and practice — not graded'))),
        h('div', { class: 'learn-demo' },
          h('div', { class: 'preview-label' }, h('span', {}, 'Try it — a working example'), deviceToggle((d) => { device = d; draw(); }, () => device, widths)),
          h('div', { class: 'preview-frame' }, stage.el))),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { back.remove(); renderBuilder({ type: t.id, title: ex.title, folderId: libraryFolderForNew(), data: clone(ex.data) }); } }, icon('copy', { size: 16 }), h('span', {}, 'Start from this example')),
        h('button', { class: 'btn primary', type: 'button', onclick: () => { back.remove(); go(`#new/${t.id}`); } }, icon('plus', { size: 16 }), h('span', {}, 'Create from blank')))));
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') back.remove(); });
  document.body.append(back);
  draw();
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
  doc.data.style ||= {};
  state.dirty = !doc.id;
  let tab = 'content';
  let device = 'embed';
  const history = { stack: [JSON.stringify(doc.data)], pos: 0 };
  const dirtyEl = h('span', { class: 'dirty' }, state.dirty ? 'Not saved yet' : '');
  const markDirty = () => { state.dirty = true; dirtyEl.textContent = 'Unsaved changes'; dirtyEl.className = 'dirty'; };
  const stage = scaledStage(doc.data.style.width || 800);
  const widths = () => ({ embed: doc.data.style.width || 800, tablet: 768, phone: 390 });
  const drawPreview = () => {
    stage.inner.replaceChildren(renderContent(doc.type, clone(doc.data), { report: (s, m) => toast(`Preview score: ${s} / ${m} (not recorded)`), preview: true }));
    stage.setWidth(widths()[device]);
    devHost.replaceChildren(deviceToggle((d) => { device = d; drawPreview(); }, () => device, widths()));
  };
  const devHost = h('span');
  const schedulePreview = debounce(drawPreview, 300);
  const pushHistory = debounce(() => {
    const snap = JSON.stringify(doc.data);
    if (snap === history.stack[history.pos]) return;
    history.stack = history.stack.slice(0, history.pos + 1);
    history.stack.push(snap);
    if (history.stack.length > 100) history.stack.shift();
    history.pos = history.stack.length - 1;
    drawUndo();
  }, 450);
  const ctx = { api, onChange: () => { markDirty(); schedulePreview(); pushHistory(); } };

  const undoBtn = iconBtn('undo', 'Undo (Ctrl+Z)', () => stepHistory(-1));
  const redoBtn = iconBtn('redo', 'Redo (Ctrl+Shift+Z)', () => stepHistory(1));
  const drawUndo = () => { undoBtn.disabled = history.pos <= 0; redoBtn.disabled = history.pos >= history.stack.length - 1; };
  const stepHistory = (dir) => {
    const n = history.pos + dir;
    if (n < 0 || n >= history.stack.length) return;
    history.pos = n;
    doc.data = JSON.parse(history.stack[n]);
    markDirty(); drawEditor(); drawPreview(); drawUndo();
  };

  const titleInput = h('input', { class: 'title-input', type: 'text', value: doc.title, placeholder: `Untitled ${t.name}`, 'aria-label': 'Title', maxlength: 200, oninput: (e) => { doc.title = e.target.value; markDirty(); } });
  const folderSel = h('select', { 'aria-label': 'Folder', onchange: (e) => { doc.folderId = e.target.value || null; markDirty(); } },
    h('option', { value: '' }, 'Unfiled'), state.folders.map((f) => h('option', { value: f.id, selected: f.id === doc.folderId }, f.name)));

  const save = async () => {
    if (!doc.title.trim()) { titleInput.focus(); toast('Please add a title first.', 'error'); return null; }
    try {
      const body = { type: doc.type, title: doc.title, folderId: doc.folderId, data: doc.data };
      const saved = doc.id ? await api.put(`/api/contents/${doc.id}`, body) : await api.post('/api/contents', body);
      const wasNew = !doc.id;
      doc.id = saved.id; state.dirty = false; dirtyEl.textContent = 'Saved'; dirtyEl.className = 'dirty saved';
      if (wasNew) window.history.replaceState(null, '', `#edit/${saved.id}`);
      loadLibrary().catch(() => {});
      return saved;
    } catch (e) { toast(e.message, 'error'); return null; }
  };
  const canEmbed = state.me.lti?.canEmbed;
  const back = async () => {
    if (state.dirty && !await modal({ title: 'Leave without saving?', body: 'Your unsaved changes will be lost.', confirm: 'Leave', danger: true })) return;
    state.dirty = false; go('#');
  };

  const editorPane = h('section', { class: 'editor-pane', 'aria-label': 'Editor' });
  const tabsEl = h('div', { class: 'editor-tabs', role: 'tablist' });
  const editorBody = h('div', { class: 'editor-body' });
  const drawEditor = () => {
    tabsEl.replaceChildren(
      h('button', { type: 'button', role: 'tab', class: tab === 'content' ? 'on' : '', 'aria-selected': String(tab === 'content'), onclick: () => { tab = 'content'; drawEditor(); } }, icon('edit', { size: 15 }), h('span', {}, 'Content')),
      h('button', { type: 'button', role: 'tab', class: tab === 'style' ? 'on' : '', 'aria-selected': String(tab === 'style'), onclick: () => { tab = 'style'; drawEditor(); } }, icon('palette', { size: 15 }), h('span', {}, 'Appearance')),
      h('button', { type: 'button', role: 'tab', class: tab === 'about' ? 'on' : '', 'aria-selected': String(tab === 'about'), onclick: () => { tab = 'about'; drawEditor(); } }, icon('info', { size: 15 }), h('span', {}, 'About')));
    editorBody.replaceChildren(
      tab === 'content' ? t.editor(doc.data, ctx)
        : tab === 'style' ? h('div', {}, h('p', { class: 'help top-help' }, 'Colours, font and size for this item. Embed width sets how wide it appears in ReachLMS — the preview shows exactly that size.'), styleEditor(doc.data, () => { ctx.onChange(); devHost.replaceChildren(deviceToggle((d) => { device = d; drawPreview(); }, () => device, widths())); }))
          : h('div', { class: 'about-pane' }, h('p', {}, t.about.summary), h('h5', {}, 'Good for'), h('ul', {}, t.about.uses.map((u) => h('li', {}, u))), h('h5', {}, 'What learners do'), h('p', {}, t.about.learners), h('div', { class: 'tip' }, icon('sparkles', { size: 16 }), h('div', {}, h('strong', {}, 'Tip: '), t.about.tip))));
  };
  drawEditor();
  editorPane.append(tabsEl, editorBody);

  app.replaceChildren(topbar('library'), banner() || '',
    h('div', { class: 'builder-bar' },
      h('button', { class: 'btn', type: 'button', onclick: back }, icon('arrow-left', { size: 16 }), h('span', { class: 'hide-sm' }, 'Library')),
      h('span', { class: 'ticon', title: t.name, style: { background: t.color } }, icon(t.icon, { size: 16 })),
      titleInput, folderSel, h('span', { class: 'undo-group' }, undoBtn, redoBtn), dirtyEl,
      h('button', { class: `btn ${canEmbed ? '' : 'primary'}`, type: 'button', onclick: async () => { if (await save()) toast('Saved'); } }, icon('save', { size: 16 }), h('span', {}, 'Save')),
      canEmbed && h('button', { class: 'btn primary', type: 'button', onclick: async () => { const s = await save(); if (s) embed(s.id); } }, icon('insert', { size: 16 }), h('span', {}, 'Save & insert'))),
    h('div', { class: 'builder' },
      editorPane,
      h('section', { class: 'preview-pane', 'aria-label': 'Live preview' },
        h('div', { class: 'preview-label' }, h('span', {}, icon('eye', { size: 14 }), 'Live preview — exactly as it will appear'), devHost),
        h('div', { class: 'preview-frame' }, stage.el))));
  drawUndo();
  drawPreview();
  app.onkeydown = (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.target.closest('[contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey && !e.target.matches('input,textarea')) { e.preventDefault(); stepHistory(-1); }
    if ((k === 'z' && e.shiftKey) || k === 'y') { if (!e.target.matches('input,textarea')) { e.preventDefault(); stepHistory(1); } }
    if (k === 's') { e.preventDefault(); save().then((s) => s && toast('Saved')); }
  };
  if (!doc.title) titleInput.focus();
}

// ---------------- embed (LTI deep linking response) ----------------
async function embed(contentId) {
  if (state.dirty && !await modal({ title: 'Insert without saving?', body: 'Unsaved changes will not be included.', confirm: 'Insert anyway' })) return;
  try {
    const { returnUrl, jwt } = await api.post('/api/embed', { contentId });
    state.dirty = false;
    app.replaceChildren(h('div', { class: 'loading' }, logo({ size: 'lg' }), h('p', {}, 'Inserting into ReachLMS…')));
    const form = h('form', { method: 'post', action: returnUrl }, h('input', { type: 'hidden', name: 'JWT', value: jwt }));
    document.body.append(form);
    form.submit();
  } catch (e) { toast(e.message, 'error'); }
}

// ---------------- admin ----------------
const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
const fmtDate = (s) => (s ? new Date(`${s.replace(' ', 'T')}Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

async function renderAdmin() {
  app.replaceChildren(topbar('admin'), h('div', { class: 'loading' }, 'Loading admin dashboard…'));
  let stats; let users;
  try { [stats, users] = await Promise.all([api.get('/api/admin/stats'), api.get('/api/admin/users')]); } catch (e) { toast(e.message, 'error'); return go('#'); }
  const statCard = (ic, label, value, sub) => h('div', { class: 'stat' }, h('span', { class: 'stat-ico' }, icon(ic, { size: 20 })), h('div', {}, h('div', { class: 'stat-v' }, String(value)), h('div', { class: 'stat-l' }, label), sub && h('div', { class: 'stat-s' }, sub)));
  const maxType = Math.max(1, ...stats.byType.map((r) => r.n));
  const table = h('div', { class: 'table-wrap' });
  const search = h('div', { class: 'search' }, icon('search', { size: 16 }), h('input', { type: 'search', placeholder: 'Search name or email…', 'aria-label': 'Search users',
    oninput: debounce(async (e) => { users = await api.get(`/api/admin/users?q=${encodeURIComponent(e.target.value)}`); drawTable(); }, 250) }));

  const drawTable = () => {
    if (!users.length) { table.replaceChildren(h('p', { class: 'help', style: { padding: '16px' } }, 'No users found.')); return; }
    table.replaceChildren(h('table', { class: 'users' },
      h('thead', {}, h('tr', {}, ['User', 'Role', 'Status', 'Content', 'Storage', 'Joined', 'Last active', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, users.map((u) => h('tr', { class: u.status !== 'active' ? 'muted' : '' },
        h('td', {}, h('button', { class: 'user-cell', type: 'button', onclick: () => userDetail(u.id) }, h('span', { class: 'avatar sm' }, u.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()), h('span', {}, h('strong', {}, u.name), h('small', {}, u.email)))),
        h('td', {}, h('span', { class: `pill ${u.role}` }, u.role === 'admin' ? 'Admin' : 'Teacher')),
        h('td', {}, h('span', { class: `pill ${u.status}` }, u.status === 'active' ? 'Active' : 'Suspended')),
        h('td', { class: 'num' }, String(u.contents)),
        h('td', { class: 'num' }, fmtBytes(u.media_bytes)),
        h('td', {}, fmtDate(u.created_at)),
        h('td', {}, u.last_seen ? timeAgo(u.last_seen) : 'Never'),
        h('td', { class: 'row-actions' }, iconBtn('eye', `View ${u.name}`, () => userDetail(u.id)), userMenu(u)))))));
  };

  const userMenu = (u) => {
    const me = u.id === state.me.user.id;
    return h('span', { class: 'row-btns' },
      !me && (u.status === 'active'
        ? iconBtn('ban', `Suspend ${u.name}`, () => setStatus(u, 'suspended'))
        : iconBtn('restore', `Reactivate ${u.name}`, () => setStatus(u, 'active'))),
      !me && iconBtn('shield', u.role === 'admin' ? `Remove admin from ${u.name}` : `Make ${u.name} an admin`, () => setRole(u, u.role === 'admin' ? 'teacher' : 'admin'), { cls: u.role === 'admin' ? 'on' : '' }),
      !me && iconBtn('trash', `Delete ${u.name}`, () => deleteUser(u), { cls: 'danger' }));
  };
  const refreshUsers = async () => { users = await api.get('/api/admin/users'); stats = await api.get('/api/admin/stats'); renderAdminBody(); };
  const setStatus = async (u, status) => {
    const suspend = status === 'suspended';
    if (!await modal({ title: suspend ? `Suspend ${u.name}?` : `Reactivate ${u.name}?`, body: suspend ? 'They will be signed out and can\'t sign in or create content. Content they already embedded in ReachLMS keeps working for students. You can reactivate them later.' : 'They will be able to sign in and use ReachStudio again.', confirm: suspend ? 'Suspend account' : 'Reactivate', danger: suspend })) return;
    try { await api.patch(`/api/admin/users/${u.id}`, { status }); toast(suspend ? 'Account suspended' : 'Account reactivated'); refreshUsers(); } catch (e) { toast(e.message, 'error'); }
  };
  const setRole = async (u, role) => {
    if (!await modal({ title: role === 'admin' ? `Make ${u.name} an admin?` : `Remove admin from ${u.name}?`, body: role === 'admin' ? 'Admins can see every user, suspend or delete accounts, and preview anyone\'s content.' : 'They will keep their account and content, as a teacher.', confirm: role === 'admin' ? 'Make admin' : 'Remove admin' })) return;
    try { await api.patch(`/api/admin/users/${u.id}`, { role }); toast('Role updated'); refreshUsers(); } catch (e) { toast(e.message, 'error'); }
  };
  const deleteUser = async (u) => {
    const body = h('div', {}, h('p', {}, `This permanently deletes ${u.name}'s account, their ${u.contents} content item(s) and uploaded files. Anywhere their content is embedded in ReachLMS will show "Content not found". This can't be undone.`),
      h('label', {}, `Type their email (${u.email}) to confirm`, h('input', { type: 'text', autocomplete: 'off' })));
    const v = await modal({ title: `Delete ${u.name}'s account?`, body, confirm: 'Delete account', danger: true });
    if (v === null) return;
    if (String(v).trim().toLowerCase() !== u.email.toLowerCase()) { toast('The email didn\'t match — nothing was deleted.', 'error'); return; }
    try { await api.del(`/api/admin/users/${u.id}`); toast('Account deleted'); refreshUsers(); } catch (e) { toast(e.message, 'error'); }
  };

  async function userDetail(id) {
    const d = await api.get(`/api/admin/users/${id}`);
    const u = d.user;
    const body = h('div', { class: 'user-detail' },
      h('div', { class: 'ud-head' }, h('span', { class: 'avatar lg' }, u.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()),
        h('div', {}, h('h4', {}, u.name), h('p', {}, u.email), h('p', {}, h('span', { class: `pill ${u.role}` }, u.role === 'admin' ? 'Admin' : 'Teacher'), ' ', h('span', { class: `pill ${u.status}` }, u.status === 'active' ? 'Active' : 'Suspended')))),
      h('div', { class: 'ud-stats' },
        h('div', {}, h('strong', {}, String(u.contents)), h('span', {}, 'content items')),
        h('div', {}, h('strong', {}, fmtBytes(u.media_bytes)), h('span', {}, 'uploads')),
        h('div', {}, h('strong', {}, fmtDate(u.created_at)), h('span', {}, 'joined')),
        h('div', {}, h('strong', {}, u.last_seen ? timeAgo(u.last_seen) : 'Never'), h('span', {}, 'last active')),
        h('div', {}, h('strong', {}, u.linked ? 'Yes' : 'No'), h('span', {}, 'linked to ReachLMS'))),
      d.byType.length > 0 && h('div', { class: 'ud-types' }, d.byType.map((r) => typeChip(TYPES[r.type] || { name: r.type, icon: 'help', color: '#888' }).appendChild(h('b', {}, ` ${r.n}`)).parentElement)),
      h('h5', {}, 'Content'),
      d.contents.length ? h('ul', { class: 'ud-list' }, d.contents.map((c) => {
        const t = TYPES[c.type] || { name: c.type, icon: 'help', color: '#888' };
        return h('li', {}, h('span', { class: 'ticon', style: { background: t.color } }, icon(t.icon, { size: 14 })), h('span', { class: 'grow' }, h('strong', {}, c.title), h('small', {}, `${t.name} · updated ${timeAgo(c.updated_at)}`)),
          h('button', { class: 'btn sm', type: 'button', onclick: async () => { const full = await api.get(`/api/admin/contents/${c.id}`); previewModal(full.type, full.title, full.data, { subtitle: `${t.name} · by ${full.owner} (read only)` }); } }, icon('eye', { size: 15 }), h('span', {}, 'Preview')));
      })) : h('p', { class: 'help' }, 'No content yet.'));
    await modal({ title: 'User details', body, confirm: null, cancel: 'Close', wide: true });
  }

  const renderAdminBody = () => {
    app.replaceChildren(topbar('admin'), h('section', { class: 'main admin' },
      h('div', { class: 'main-head' }, h('h2', {}, 'Admin dashboard'), h('p', { class: 'help' }, 'Manage ReachStudio accounts and see how it is being used.')),
      h('div', { class: 'stats' },
        statCard('users', 'Accounts', stats.users, `${stats.newLast30} new in the last 30 days`),
        statCard('activity', 'Active (30 days)', stats.activeLast30, `${stats.suspendedUsers} suspended`),
        statCard('library', 'Content items', stats.contents),
        statCard('database', 'Storage used', fmtBytes(stats.mediaBytes)),
        statCard('award', 'Grades sent', stats.gradesSent, `${stats.attempts} attempt${stats.attempts === 1 ? '' : 's'} recorded`)),
      h('div', { class: 'admin-grid' },
        h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', {}, 'Users'), search), table),
        h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h3', {}, 'Content by type')),
          stats.byType.length ? h('div', { class: 'bars' }, stats.byType.map((r) => {
            const t = TYPES[r.type] || { name: r.type, icon: 'help', color: '#888' };
            return h('div', { class: 'bar-row' }, h('span', { class: 'bar-l' }, icon(t.icon, { size: 14 }), t.name), h('span', { class: 'bar' }, h('span', { style: { width: `${(r.n / maxType) * 100}%`, background: t.color } })), h('span', { class: 'bar-n' }, String(r.n)));
          })) : h('p', { class: 'help', style: { padding: '0 16px 16px' } }, 'No content yet.'),
          h('div', { class: 'panel-head' }, h('h3', {}, 'Connected ReachLMS sites')),
          h('ul', { class: 'sites' }, stats.platforms.length ? stats.platforms.map((p) => h('li', {}, icon('link', { size: 14 }), h('span', {}, h('strong', {}, p.name), h('small', {}, p.issuer)))) : h('li', { class: 'help' }, 'None yet — install ReachStudio in ReachLMS with Dynamic Registration.'))))));
    drawTable();
  };
  renderAdminBody();
}

// ---------------- helpers ----------------
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function timeAgo(s) {
  const d = new Date(`${String(s).replace(' ', 'T')}Z`);
  const sec = (Date.now() - d) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} d ago`;
  return d.toLocaleDateString();
}

boot().catch((e) => { console.error(e); if (!app.querySelector('.auth-card')) app.replaceChildren(h('div', { class: 'center-card' }, h('h1', {}, 'Something went wrong'), h('p', {}, e.message))); });
