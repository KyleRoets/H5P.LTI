// ReachQuizzes — teacher screens inside the course (Quizzes+): the quiz list grouped by
// assignment group (like ReachLMS's Quizzes page) and the quiz editor (Details, Questions,
// Assign To). Every save updates the quiz's assignment in ReachLMS.
import { h, toast, modal, iconBtn, richField, selectField, checkField, segmentField, clone } from '../util.js';
import { icon } from '../icons.js';
import { KINDS, KIND_ORDER, newQuestion, questionEditor, questionText } from './questions.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);
const pts = (n) => `${Math.round((Number(n) || 0) * 100) / 100} pt${Number(n) === 1 ? '' : 's'}`;
const GRADING = [['points', 'Points'], ['percent', 'Percentage'], ['letter_grade', 'Letter grade'], ['gpa_scale', 'GPA scale'], ['pass_fail', 'Complete / Incomplete'], ['not_graded', 'Not graded']];

export function initRq({ app, api, topbar, go, moreMenu, responsesTable, snapshotFrame, fmtWhen }) {
  // ---------- connect to ReachLMS (one-time Authorize) ----------
  function connectCard(status, after) {
    const btn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      let url;
      try { ({ url } = await api.post('/api/canvas/authorize')); } catch (e) { toast(e.message, 'error'); return; }
      const w = window.open(url, 'reachquizzes-auth', 'width=560,height=720');
      if (!w) { toast('Allow pop-ups for this page, then click Authorize again.', 'error'); return; }
      btn.disabled = true; btn.lastChild.textContent = 'Waiting for ReachLMS…';
      const done = (e) => { if (e.data?.subject === 'reachquizzes.connected') { window.removeEventListener('message', done); clearInterval(poll); after(); } };
      window.addEventListener('message', done);
      const poll = setInterval(async () => { if (w.closed) { clearInterval(poll); window.removeEventListener('message', done); after(); } }, 800);
    } }, icon('link', { size: 16 }), h('span', {}, 'Authorize'));
    return h('div', { class: 'rq-connect' },
      h('span', { class: 'rq-connect-ico' }, icon('shield', { size: 26 })),
      h('div', {},
        h('h3', {}, 'Connect Quizzes+ to ReachLMS'),
        h('p', {}, 'Quizzes+ creates each quiz as an assignment in this course, in the assignment group you choose, with its description, dates and who it\'s assigned to. ReachLMS asks you to allow that once.'),
        status.configured ? btn : h('p', { class: 'warn' }, icon('alert', { size: 16 }), h('span', {}, 'Your ReachLMS administrator still needs to add the ReachQuizzes API key (see the setup guide). Until then quizzes can\'t be created.'))));
  }

  // ---------- quiz list ----------
  async function renderQuizzes() {
    app.replaceChildren(topbar('quizzes'), h('div', { class: 'loading-sm rq-loading' }, 'Loading quizzes…'));
    let r;
    try { r = await api.get('/api/quizzes'); } catch (e) { app.replaceChildren(topbar('quizzes'), h('div', { class: 'empty' }, h('h3', {}, 'Could not load quizzes'), h('p', {}, e.message))); return; }
    const head = h('div', { class: 'rq-top' },
      h('div', {}, h('h2', {}, r.label), h('p', { class: 'help' }, r.course || '')),
      r.connected && h('button', { class: 'btn primary', type: 'button', onclick: () => newQuiz(r) }, icon('plus', { size: 16 }), h('span', {}, 'Quiz')));
    // Anything that stops quizzes being created gets a clear explanation (never an empty page).
    const problem = !r.signedIn
      ? 'Quizzes+ couldn\'t set up your account automatically: a ReachStudio account with your email already exists. Open ReachStudio once from the editor\'s ReachStudio button and sign in to it; Quizzes+ then uses the same account.'
      : !r.courseKnown
        ? 'ReachLMS didn\'t send this course\'s ID with the launch. Ask your administrator to reinstall ReachQuizzes (Developer Keys → + Dynamic Registration with /lti/register?app=quizzes); the current version asks for it.'
        : null;
    if (problem) { app.replaceChildren(topbar('quizzes'), h('section', { class: 'main rq' }, head, h('div', { class: 'rq-connect' }, h('span', { class: 'rq-connect-ico warnico' }, icon('alert', { size: 26 })), h('div', {}, h('h3', {}, 'Quizzes+ isn\'t ready in this course yet'), h('p', {}, problem))))); return; }
    if (!r.connected) { app.replaceChildren(topbar('quizzes'), h('section', { class: 'main rq' }, head, connectCard(r, renderQuizzes))); return; }

    const byGroup = new Map(r.groups.map((g) => [g.id, []]));
    const other = [];
    r.quizzes.forEach((q) => (byGroup.has(q.groupId) ? byGroup.get(q.groupId) : other).push(q));
    const togglePublish = async (q, btn) => {
      btn.disabled = true;
      try { const x = await api.post(`/api/quizzes/${q.id}/publish`, { published: !q.published }); q.published = x.published; toast(x.published ? 'Published — students can see it' : 'Unpublished'); renderQuizzes(); } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
    };
    const row = (q) => {
      const pub = h('button', { type: 'button', class: `rq-pub ${q.published ? 'on' : ''}`, title: q.published ? 'Published — click to unpublish' : 'Unpublished — click to publish', 'aria-label': q.published ? `Unpublish ${q.title}` : `Publish ${q.title}` },
        icon(q.published ? 'check' : 'ban', { size: 16, stroke: 2.5 }));
      pub.onclick = () => togglePublish(q, pub);
      return h('div', { class: `rq-item ${q.published ? '' : 'unpublished'}` },
        h('span', { class: 'rq-item-ico' }, icon('type-quiz', { size: 18 })),
        h('div', { class: 'rq-item-main' },
          h('a', { href: `#rq/${q.id}`, class: 'rq-item-title' }, q.title),
          h('div', { class: 'rq-item-meta' }, ...[
            q.due ? h('span', {}, h('strong', {}, 'Due'), ` ${fmtDate(q.due)}`) : h('span', {}, 'No due date'),
            h('span', {}, pts(q.points)), h('span', {}, `${q.questions} Question${q.questions === 1 ? '' : 's'}`),
            q.students > 0 && h('span', {}, `${q.students} submitted`)].filter(Boolean))),
        pub,
        moreMenu(q.title, [
          ['edit', 'Edit', () => go(`#rq/${q.id}`)],
          ['eye', 'Preview', () => preview(q)],
          ['users', 'Results', () => results(q)],
          ['trash', 'Delete', () => remove(q), 'danger'],
        ]));
    };
    const total = r.groups.reduce((n, g) => n + (Number(g.weight) || 0), 0);
    const groupBlock = (name, list, weight) => h('section', { class: 'rq-group-block' },
      h('header', {}, h('span', {}, icon('chevron-down', { size: 16 }), name), r.weighted && weight !== undefined && h('span', { class: 'rq-weight' }, `${weight}% of total`)),
      list.length ? list.map(row) : h('p', { class: 'rq-none' }, 'No quizzes in this group.'));
    const search = h('input', { type: 'search', class: 'rq-search', placeholder: 'Search for quiz', 'aria-label': 'Search quizzes', oninput: (e) => {
      const v = e.target.value.toLowerCase();
      list.querySelectorAll('.rq-item').forEach((el) => { el.hidden = !el.querySelector('.rq-item-title').textContent.toLowerCase().includes(v); });
    } });
    const list = h('div', { class: 'rq-groups' },
      ...r.groups.filter((g) => byGroup.get(g.id).length).map((g) => groupBlock(g.name, byGroup.get(g.id), g.weight)),
      other.length > 0 && groupBlock('Other quizzes', other));
    app.replaceChildren(topbar('quizzes'), h('section', { class: 'main rq' },
      head,
      r.error && h('p', { class: 'warn' }, icon('alert', { size: 16 }), h('span', {}, r.error)),
      r.weighted && total > 0 && h('p', { class: 'help' }, 'Assignment groups are weighted in this course; the weights are set in ReachLMS (Assignments).'),
      r.quizzes.length ? h('div', {}, h('div', { class: 'rq-tools' }, search), list)
        : h('div', { class: 'empty' }, icon('type-quiz', { size: 34 }), h('h3', {}, 'No quizzes yet'),
          h('p', {}, 'Build quizzes with multiple choice, true/false, numeric, fill in the blanks, matching, ordering, categorization, drag and drop on images, hot spots and essays. Each one is an assignment in this course.'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => newQuiz(r) }, icon('plus', { size: 16 }), h('span', {}, 'Quiz')))));
  }

  async function newQuiz(r) {
    const form = { title: '', groupId: r.groups[0]?.id || '' };
    const body = h('div', { class: 'rq-new' },
      h('label', {}, 'Quiz name', h('input', { type: 'text', placeholder: 'e.g. Week 3 quiz', oninput: (e) => { form.title = e.target.value; } })),
      selectField('Assignment group', form, 'groupId', r.groups.map((g) => [g.id, `${g.name}${r.weighted ? ` (${g.weight}%)` : ''}`]), () => {}));
    if (!await modal({ title: 'New quiz', body, confirm: 'Create quiz' })) return;
    try { const { id } = await api.post('/api/quizzes', { title: form.title || 'Untitled quiz', groupId: form.groupId }); go(`#rq/${id}`); } catch (e) { toast(e.message, 'error'); }
  }
  async function preview(q) { try { const { url } = await api.post(`/api/quizzes/${q.id}/open`); location.assign(url); } catch (e) { toast(e.message, 'error'); } }
  async function remove(q) {
    if (!await modal({ title: `Delete "${q.title}"?`, body: 'This deletes the quiz and its assignment in ReachLMS, with any grades in that column. Attempts stay in ReachStudio. This can\'t be undone.', confirm: 'Delete', danger: true })) return;
    try { await api.del(`/api/quizzes/${q.id}`); toast('Deleted'); renderQuizzes(); } catch (e) { toast(e.message, 'error'); }
  }
  async function results(q) {
    let res;
    try { res = await api.get(`/api/quizzes/${q.id}/results`); } catch (e) { toast(e.message, 'error'); return; }
    const view = async (id) => {
      const d = await api.get(`/api/submissions/${id}`); const sub = d.submission;
      document.querySelectorAll('.modal-back').forEach((m) => m.remove());
      await modal({ title: `${sub.name || 'Student'} — attempt ${sub.attempt}`, wide: true, confirm: null, cancel: 'Close',
        body: h('div', { class: 'sub-view' }, h('p', { class: 'sub-line' }, `Score ${sub.score} / ${sub.max}`, ' · ', fmtWhen(sub.at)), responsesTable(sub.responses) || '', snapshotFrame(sub.snapshot, window.BOOT?.build || '')) });
    };
    await modal({ title: `Results — ${q.title}`, wide: true, confirm: null, cancel: 'Close', body: res.students.length
      ? h('table', { class: 'results' }, h('thead', {}, h('tr', {}, ['Student', 'Attempts', 'Latest', 'Submitted', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, res.students.map((st) => { const last = st.attempts.at(-1); return h('tr', {}, h('td', {}, st.name), h('td', { class: 'num' }, String(st.attempts.length)),
          h('td', {}, `${last.score ?? '–'} / ${last.max}`), h('td', {}, fmtWhen(last.at)),
          h('td', {}, h('button', { class: 'btn sm', type: 'button', onclick: () => view(last.id) }, icon('eye', { size: 14 }), h('span', {}, 'View')))); })))
      : h('p', { class: 'help' }, 'No submissions yet. Students\' attempts also appear in SpeedGrader.') });
  }

  // ---------- quiz editor ----------
  async function renderQuizEdit(id) {
    app.replaceChildren(topbar('quizzes'), h('div', { class: 'loading-sm rq-loading' }, 'Opening the quiz…'));
    let q;
    try { q = await api.get(`/api/quizzes/${id}`); } catch (e) {
      if (e.data?.needsAuth) return renderQuizzes();
      app.replaceChildren(topbar('quizzes'), h('div', { class: 'empty' }, h('h3', {}, 'Could not open the quiz'), h('p', {}, e.message))); return;
    }
    const data = q.data;
    data.questions ||= []; data.grading ||= {}; data.settings ||= {};
    const g = data.grading;
    g.attempts = String(g.attempts ?? 1); g.keep ||= 'best'; g.showFeedback ??= true; g.showScore ??= true; g.showAnswers ??= false;
    const meta = { title: q.title, groupId: q.groupId || q.groups[0]?.id || '', gradingType: q.gradingType || 'points' };
    let assign = q.assign.length ? q.assign : [{ id: 'a0', targets: ['everyone'], due: null, unlock: null, lock: null }];
    let dirty = false; let tab = 'details';
    const dirtyEl = h('span', { class: 'dirty' });
    const changed = () => { dirty = true; dirtyEl.textContent = 'Unsaved changes'; dirtyEl.className = 'dirty'; drawTotals(); };
    const ctx = { api, onChange: changed };
    const total = () => Math.round(data.questions.reduce((n, x) => n + (Number(x.points) || 0), 0) * 100) / 100;
    const totalsEl = h('span', { class: 'rq-total' });
    const drawTotals = () => { totalsEl.textContent = `${pts(total())} · ${data.questions.length} question${data.questions.length === 1 ? '' : 's'}`; };

    const save = async (publish) => {
      if (!meta.title.trim()) { toast('Give the quiz a name.', 'error'); return false; }
      if (publish && !data.questions.length) { toast('Add at least one question before publishing.', 'error'); return false; }
      try {
        const r = await api.put(`/api/quizzes/${id}`, { title: meta.title, data, groupId: meta.groupId, gradingType: meta.gradingType, assign, ...(publish !== undefined ? { published: publish } : {}) });
        q.published = r.published; dirty = false; dirtyEl.textContent = 'Saved'; dirtyEl.className = 'dirty saved'; drawPub();
        toast(publish ? 'Saved and published' : 'Saved — the assignment in ReachLMS is up to date');
        return true;
      } catch (e) { toast(e.message, 'error'); return false; }
    };
    const pubEl = h('span', { class: 'rq-pubstate' });
    const drawPub = () => pubEl.replaceChildren(q.published ? h('span', { class: 'pill active' }, icon('check', { size: 12 }), 'Published') : h('span', { class: 'pill pending' }, 'Not published'));
    drawPub();
    const back = async () => { if (dirty && !await modal({ title: 'Leave without saving?', body: 'Your unsaved changes will be lost.', confirm: 'Leave', danger: true })) return; go('#quizzes'); };

    // Details
    const details = () => h('div', { class: 'rq-pane' },
      h('div', { class: 'field' }, h('label', {}, 'Quiz name', h('input', { type: 'text', value: meta.title, oninput: (e) => { meta.title = e.target.value; changed(); } }))),
      richField('Quiz instructions', data, 'description', changed, { placeholder: 'What students should know before they start…' }),
      h('div', { class: 'field-row' },
        selectField('Assignment group', meta, 'groupId', q.groups.map((x) => [x.id, `${x.name}${q.weighted ? ` (${x.weight}%)` : ''}`]), changed),
        selectField('Display grade as', meta, 'gradingType', GRADING, changed)),
      h('p', { class: 'help' }, 'Points come from the questions: ', totalsEl, '. Group weights are set on ReachLMS\'s Assignments page.'),
      h('div', { class: 'section-title' }, 'Attempts'),
      h('div', { class: 'field-row' },
        selectField('Allowed attempts', g, 'attempts', [['1', '1'], ['2', '2'], ['3', '3'], ['5', '5'], ['10', '10'], ['0', 'Unlimited']].map(([v, t]) => [v, t]), changed, {}),
        segmentField('Score to keep', g, 'keep', [['best', 'Highest'], ['latest', 'Latest']], changed)),
      checkField('Shuffle the order of questions for each student', data.settings, 'shuffleQuestions', changed),
      h('div', { class: 'section-title' }, 'After students submit'),
      checkField('Show their score', g, 'showScore', changed),
      checkField('Show which answers were right or wrong', g, 'showFeedback', changed),
      checkField('Show the correct answers', g, 'showAnswers', changed),
      h('p', { class: 'help' }, 'While answering, students never see marking. Choice and numeric answers are marked on the server; their answer keys never reach students\' browsers.'));
    // keep select value types consistent (attempts stored as numbers)
    const fixAttempts = () => { g.attempts = Number(g.attempts) || 0; };

    // Questions
    const questionsHost = h('div', { class: 'rq-questions' });
    const drawQuestions = () => {
      questionsHost.replaceChildren(...data.questions.map((x, i) => questionCard(x, i)),
        h('button', { class: 'btn rq-addq', type: 'button', onclick: addQuestion }, icon('plus', { size: 16 }), h('span', {}, 'Question')));
      drawTotals();
    };
    const questionCard = (x, i) => {
      const k = KINDS[x.kind];
      const open = x._open !== false;
      const bodyEl = h('div', { class: 'rq-qbody' }, open ? questionEditor(x, ctx) : null);
      const move = (d) => { const j = i + d; if (j < 0 || j >= data.questions.length) return; [data.questions[i], data.questions[j]] = [data.questions[j], data.questions[i]]; changed(); drawQuestions(); };
      const partialOk = x.kind === 'ma' || k.type;
      return h('article', { class: 'rq-qcard' },
        h('header', {},
          h('button', { type: 'button', class: 'rq-qtoggle', 'aria-expanded': String(open), onclick: () => { x._open = !open; drawQuestions(); } }, icon(open ? 'chevron-down' : 'chevron-right', { size: 16 }),
            h('span', { class: 'rq-qn' }, `Question ${i + 1}`), h('span', { class: 'rq-qkind' }, icon(k.icon, { size: 14 }), k.name), !open && h('span', { class: 'rq-qpreview' }, questionText(x).slice(0, 80))),
          h('label', { class: 'rq-qpts' }, h('input', { type: 'number', min: 0, step: 'any', value: x.points, 'aria-label': 'Points', oninput: (e) => { x.points = Number(e.target.value) || 0; changed(); } }), 'pts'),
          partialOk && x.kind !== 'essay' && h('label', { class: 'rq-partial', title: 'Partial credit: points for each part that is right' }, h('input', { type: 'checkbox', checked: x.partial !== false, onchange: (e) => { x.partial = e.target.checked; changed(); } }), 'Partial credit'),
          h('span', { class: 'rq-qactions' },
            iconBtn('chevron-up', 'Move up', () => move(-1), { disabled: i === 0 }),
            iconBtn('chevron-down', 'Move down', () => move(1), { disabled: i === data.questions.length - 1 }),
            iconBtn('copy', 'Duplicate', () => { const c = clone(x); c.id = Math.random().toString(36).slice(2, 10); data.questions.splice(i + 1, 0, c); changed(); drawQuestions(); }),
            iconBtn('trash', 'Delete question', () => { data.questions.splice(i, 1); changed(); drawQuestions(); }, { cls: 'danger' }))),
        bodyEl);
    };
    const addQuestion = async () => {
      let picked = null;
      const grid = h('div', { class: 'rq-kinds' }, KIND_ORDER.map((kid) => {
        const k = KINDS[kid];
        const b = h('button', { type: 'button', class: 'rq-kind', onclick: () => { picked = kid; document.querySelector('.modal-back .btn.primary')?.click(); } },
          h('span', { class: 'rq-kind-ico' }, icon(k.icon, { size: 18 })), h('span', {}, h('strong', {}, k.name), h('small', {}, k.blurb)));
        return b;
      }));
      if (!await modal({ title: 'Add a question', wide: true, body: grid, confirm: 'Add', cancel: 'Cancel' }) || !picked) return;
      data.questions.forEach((x) => { x._open = false; });
      data.questions.push(newQuestion(picked)); changed(); drawQuestions();
      requestAnimationFrame(() => questionsHost.querySelector('.rq-qcard:last-of-type')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    };

    // Assign To
    const assignHost = h('div', { class: 'rq-assign' });
    const targetName = (t) => (t === 'everyone' ? 'Everyone' : t.startsWith('section:') ? (q.sections.find((s) => s.id === t.slice(8))?.name || 'Section') : (q.students.find((s) => s.id === t.slice(8))?.name || 'Student'));
    const drawAssign = () => {
      assignHost.replaceChildren(...assign.map((a, i) => {
        const chips = h('div', { class: 'rq-chips' }, a.targets.map((t) => h('span', { class: 'rq-chip' }, targetName(t), iconBtn('x', `Remove ${targetName(t)}`, () => { a.targets = a.targets.filter((x) => x !== t); changed(); drawAssign(); }))));
        const pick = h('select', { 'aria-label': 'Assign to', onchange: (e) => { if (e.target.value && !a.targets.includes(e.target.value)) { a.targets.push(e.target.value); changed(); drawAssign(); } } },
          h('option', { value: '' }, '+ Add students or sections…'),
          !assign.some((x) => x.targets.includes('everyone')) && h('option', { value: 'everyone' }, 'Everyone'),
          q.sections.length > 0 && h('optgroup', { label: 'Sections' }, q.sections.map((s) => h('option', { value: `section:${s.id}` }, s.name))),
          q.students.length > 0 && h('optgroup', { label: 'Students' }, q.students.map((s) => h('option', { value: `student:${s.id}` }, s.name))));
        const date = (label, key) => h('label', {}, label, h('input', { type: 'datetime-local', value: toLocal(a[key]), onchange: (e) => { a[key] = fromLocal(e.target.value); changed(); } }));
        return h('div', { class: 'rq-assign-card' },
          h('div', { class: 'rq-assign-head' }, h('strong', {}, 'Assign to'), assign.length > 1 && iconBtn('trash', 'Remove this', () => { assign.splice(i, 1); changed(); drawAssign(); })),
          chips, pick,
          h('div', { class: 'rq-dates' }, date('Due', 'due'), date('Available from', 'unlock'), date('Until', 'lock')));
      }), h('button', { class: 'btn', type: 'button', onclick: () => { assign.push({ id: `a${Date.now()}`, targets: [], due: null, unlock: null, lock: null }); changed(); drawAssign(); } }, icon('plus', { size: 15 }), h('span', {}, 'Add')),
      h('p', { class: 'help' }, 'Like ReachLMS\'s Assign To: different dates for sections or individual students. Students not included don\'t see the quiz.'));
    };

    const body = h('div', { class: 'rq-editor-body' });
    const tabs = h('div', { class: 'editor-tabs rq-tabs', role: 'tablist' });
    const drawTabs = () => {
      tabs.replaceChildren(...[['details', 'Details', 'info'], ['questions', `Questions (${data.questions.length})`, 'list'], ['assign', 'Assign To', 'users']].map(([t, label, ic]) =>
        h('button', { type: 'button', role: 'tab', class: tab === t ? 'on' : '', 'aria-selected': String(tab === t), onclick: () => { fixAttempts(); tab = t; drawTabs(); } }, icon(ic, { size: 15 }), h('span', {}, label))));
      body.replaceChildren(tab === 'details' ? details() : tab === 'questions' ? questionsHost : assignHost);
      if (tab === 'questions') drawQuestions();
      if (tab === 'assign') drawAssign();
    };
    drawTotals(); drawTabs();
    app.replaceChildren(topbar('quizzes'), h('div', { class: 'builder-bar rq-bar' },
      h('button', { class: 'btn', type: 'button', onclick: back }, icon('arrow-left', { size: 16 }), h('span', { class: 'hide-sm' }, 'Quizzes')),
      h('span', { class: 'rq-bar-title' }, h('strong', {}, meta.title || 'Untitled quiz'), totalsEl), pubEl, dirtyEl,
      h('button', { class: 'btn', type: 'button', onclick: async () => { fixAttempts(); if (!dirty || await save()) preview({ id }); } }, icon('eye', { size: 16 }), h('span', { class: 'hide-sm' }, 'Preview')),
      h('button', { class: 'btn', type: 'button', onclick: () => { fixAttempts(); save(); } }, icon('save', { size: 16 }), h('span', {}, 'Save')),
      !q.published ? h('button', { class: 'btn primary', type: 'button', onclick: async () => { fixAttempts(); if (await save(true)) go('#quizzes'); } }, icon('send', { size: 16 }), h('span', {}, 'Save & publish'))
        : h('button', { class: 'btn primary', type: 'button', onclick: async () => { fixAttempts(); if (await save()) go('#quizzes'); } }, icon('check', { size: 16 }), h('span', {}, 'Save & close'))),
    h('section', { class: 'main rq-editor' }, tabs, body));
    app.onkeydown = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); fixAttempts(); save(); } };
  }

  return { renderQuizzes, renderQuizEdit };
}
