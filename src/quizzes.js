// ReachQuizzes: course quizzes in a course menu item ("Quizzes+" by default).
// - No separate login: a teacher's ReachStudio account is created from their ReachLMS identity.
// - Quizzes belong to the course. Each one is a real ReachLMS assignment created and kept in sync
//   through Canvas's REST API as the teacher (assignment group, description, grading type, dates,
//   Assign To, published) — see canvas.js. The quiz content is a "rqquiz" item (rqquiz.js).
// - Students take a quiz on its assignment page in ReachLMS (Canvas enforces availability dates);
//   attempts, SpeedGrader submissions and review reuse the assignment machinery ("quiz:<id>").
import express from 'express';
import crypto from 'node:crypto';
import { db, newId } from './db.js';
import { config } from './config.js';
import { createSession, requireSession, requireUser } from './sessions.js';
import { views } from './views.js';
import { gradingFor } from './types.js';
import { totalPoints } from './rqquiz.js';
import { apiConfigured, apiBaseFor, authorizeUrl, completeAuthorization, isConnected, disconnect, canvasApi } from './canvas.js';

// Columns added for Canvas-synced quizzes.
const qCols = db.prepare('PRAGMA table_info(course_quizzes)').all().map((c) => c.name);
for (const [c, t] of [['canvas_course_id', 'TEXT'], ['assignment_id', 'TEXT'], ['group_id', 'TEXT'], ['group_name', 'TEXT'], ['published', 'INTEGER NOT NULL DEFAULT 0'],
  ['due_at', 'TEXT'], ['unlock_at', 'TEXT'], ['lock_at', 'TEXT'], ['grading_type', "TEXT DEFAULT 'points'"], ['assign', 'TEXT'], ['override_ids', 'TEXT']]) {
  if (!qCols.includes(c)) db.exec(`ALTER TABLE course_quizzes ADD COLUMN ${c} ${t}`);
}

const launchUrl = (quizId) => `${config.publicUrl}/lti/launch?app=quizzes&quiz=${encodeURIComponent(quizId)}`;
const platformOf = (id) => db.prepare('SELECT * FROM platforms WHERE id = ?').get(id);
const sameSite = (a, b) => a === b || (platformOf(a)?.issuer && platformOf(a)?.issuer === platformOf(b)?.issuer);
const quizKey = (id) => `quiz:${id}`;
const GRADING_TYPES = ['points', 'percent', 'letter_grade', 'gpa_scale', 'pass_fail', 'not_graded'];

/**
 * A teacher's ReachStudio account, created from their ReachLMS identity when they first open
 * ReachQuizzes (no password, no sign-in screen). Reuses a linked account when there is one.
 */
function provisionTeacher(lti) {
  const p = platformOf(lti.platformId);
  const linked = db.prepare(`SELECT i.user_id FROM lti_identities i JOIN platforms p ON p.id = i.platform_id
    WHERE p.issuer = ? AND i.sub = ? AND i.active = 1 LIMIT 1`).get(p.issuer, lti.sub);
  if (linked) return linked.user_id;
  const taken = lti.email && db.prepare('SELECT 1 FROM users WHERE email = ?').get(lti.email);
  // An existing account with this email that was never linked stays separate: proving ownership
  // needs its password (ReachStudio → Sign in) — so a profile email can't take over an account.
  if (taken) return null;
  const id = newId(12);
  const email = lti.email || `${crypto.createHash('sha256').update(`${p.issuer}|${lti.sub}`).digest('hex').slice(0, 16)}@lti.invalid`;
  db.prepare("INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'teacher')")
    .run(id, email, lti.name || 'Teacher', `!lti:${crypto.randomBytes(16).toString('hex')}`);
  db.prepare('INSERT OR REPLACE INTO lti_identities (platform_id, sub, user_id, active) VALUES (?, ?, ?, 1)').run(lti.platformId, lti.sub, id);
  return id;
}

/** Player session for one quiz attempt (same shape as an assignment launch). */
function playerSession({ lti, userId, quiz, asTeacher }) {
  const s = { ...lti, kind: 'player', contentId: quiz.content_id, resourceLinkId: quizKey(quiz.id), quizId: quiz.id };
  if (asTeacher) s.teacherAssignment = true;
  else if (quiz.lineitem) s.ags = { lineitem: quiz.lineitem };
  return createSession(userId, s);
}

function renderQuizPlayer(res, { lti, userId, quiz, asTeacher, back = '' }) {
  const content = db.prepare('SELECT * FROM contents WHERE id = ?').get(quiz.content_id);
  if (!content) return res.status(404).send(views.message('Quiz not found', 'This quiz has been deleted.'));
  const token = playerSession({ lti, userId, quiz, asTeacher });
  return res.send(views.player(token, content, {
    canEdit: false, graded: !asTeacher && !!quiz.lineitem, teacher: !!asTeacher,
    grading: gradingFor(content.type, JSON.parse(content.data)), back,
  }));
}

/** LTI launch for ReachQuizzes: the course menu item, or a quiz's assignment. */
export function quizLaunch(res, { lti, userId, quizId, ags, payload }) {
  lti.app = 'quizzes';
  const custom = payload?.['https://purl.imsglobal.org/spec/lti/claim/custom'] || {};
  const real = (v) => (v && !String(v).startsWith('$') ? String(v) : null); // unexpanded variables
  lti.canvasCourseId = real(custom.canvas_course_id);
  lti.canvasUserId = real(custom.canvas_user_id);
  lti.canvasApiBase = real(custom.canvas_api_baseurl);
  if (ags?.lineitems) lti.lineitems = ags.lineitems;
  if (quizId) {
    const quiz = db.prepare('SELECT * FROM course_quizzes WHERE id = ?').get(quizId);
    if (!quiz || !sameSite(quiz.platform_id, lti.platformId)) return res.status(404).send(views.message('Quiz not found', 'This quiz may have been removed from the course.'));
    if (ags?.lineitem && quiz.lineitem !== ags.lineitem) db.prepare('UPDATE course_quizzes SET lineitem = ? WHERE id = ?').run(ags.lineitem, quiz.id);
    if (ags?.lineitem) quiz.lineitem = ags.lineitem;
    return renderQuizPlayer(res, { lti, userId, quiz, asTeacher: lti.instructor });
  }
  if (!lti.contextId) return res.status(400).send(views.message(config.quizToolName, 'Open quizzes from a course.'));
  if (lti.instructor) {
    lti.kind = 'quizzes';
    const uid = userId || provisionTeacher(lti);
    return res.send(views.quizzesTeacher(createSession(uid, lti)));
  }
  lti.kind = 'quizlist';
  return res.send(views.quizzes(createSession(userId, lti)));
}

export const quizzesRouter = express.Router();
quizzesRouter.use('/api/quizzes', express.json({ limit: '4mb' }));
quizzesRouter.use('/api/canvas', express.json());

const inCourse = (l) => l && (l.kind === 'quizzes' || l.kind === 'quizlist') && l.contextId;
const courseQuizzes = (l) => db.prepare('SELECT * FROM course_quizzes WHERE context_id = ? ORDER BY position, created_at').all(l.contextId)
  .filter((q) => sameSite(q.platform_id, l.platformId));
const findQuiz = (l, id) => { const q = db.prepare('SELECT * FROM course_quizzes WHERE id = ?').get(id); return q && q.context_id === l.contextId && sameSite(q.platform_id, l.platformId) ? q : null; };
function requireTeacher(req, res, next) {
  requireUser(req, res, () => {
    const l = req.session.lti;
    if (!inCourse(l) || !l.instructor) return res.status(403).json({ error: 'Open ReachQuizzes from the course menu as a teacher.' });
    next();
  });
}
const contentOf = (q) => db.prepare('SELECT id, type, title, data, user_id FROM contents WHERE id = ?').get(q.content_id);
const sendError = (res, e) => { console.error(e); res.status(e.needsAuth ? 401 : 502).json({ error: e.message, needsAuth: !!e.needsAuth }); };
const courseId = (l, q) => q?.canvas_course_id || l.canvasCourseId;

// ---------- connecting to ReachLMS (one-time Authorize per teacher) ----------
quizzesRouter.get('/api/canvas/status', requireSession, (req, res) => {
  const l = req.session.lti;
  res.json({ configured: apiConfigured(), connected: !!l && isConnected(l), apiBase: l ? apiBaseFor(l) : null, courseKnown: !!l?.canvasCourseId });
});
quizzesRouter.post('/api/canvas/authorize', requireSession, (req, res) => {
  if (!apiConfigured()) return res.status(400).json({ error: 'ReachQuizzes isn\'t connected to the ReachLMS API yet. Ask your administrator to add the API key (see the setup guide).' });
  if (!inCourse(req.session.lti) || !req.session.lti.instructor) return res.status(403).json({ error: 'Only teachers connect ReachQuizzes.' });
  res.json({ url: authorizeUrl(req.session) });
});
quizzesRouter.post('/api/canvas/disconnect', requireSession, (req, res) => { if (req.session.lti) disconnect(req.session.lti); res.json({ ok: true }); });
quizzesRouter.get('/lti/canvas/callback', async (req, res) => {
  const page = (ok, msg) => `<!doctype html><meta charset="utf-8"><title>ReachQuizzes</title>
    <body style="font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;color:#1D2433;text-align:center">
    <div><h2 style="color:${ok ? '#1F9D6A' : '#C8372D'}">${ok ? 'Connected to ReachLMS' : 'Could not connect'}</h2><p>${views.esc(msg)}</p><p style="color:#5D6779">You can close this window.</p></div>
    <script>try{window.opener&&window.opener.postMessage({subject:'reachquizzes.connected',ok:${ok}},'*')}catch(e){}${ok ? 'setTimeout(function(){window.close()},800)' : ''}</script></body>`;
  if (req.query.error) return res.status(400).send(page(false, req.query.error === 'access_denied' ? 'Access was not allowed. Click Authorize again if you want to use ReachQuizzes.' : String(req.query.error_description || req.query.error)));
  try { const r = await completeAuthorization(req.query.state, req.query.code); res.send(page(true, `ReachQuizzes can now manage quizzes for ${r.name}.`)); } catch (e) { res.status(400).send(page(false, e.message)); }
});

// ---------- Canvas assignment sync ----------
// The quiz's "Assign To" rows → Canvas assignment dates + overrides (sections / students).
function canvasDates(assign = []) {
  const rows = Array.isArray(assign) ? assign : [];
  const everyone = rows.find((r) => (r.targets || []).includes('everyone'));
  return { everyone, others: rows.filter((r) => r !== everyone && (r.targets || []).length) };
}
async function syncAssignment(l, q, { title, points, description, published } = {}) {
  const api = canvasApi(l);
  const cid = courseId(l, q);
  if (!cid) throw new Error('ReachLMS did not say which course this is. Ask your administrator to reinstall ReachQuizzes (it needs the course ID variable).');
  const { everyone, others } = canvasDates(JSON.parse(q.assign || '[]'));
  const iso = (v) => (v ? new Date(v).toISOString() : null);
  const assignment = {
    name: title, description: description || '', points_possible: points,
    grading_type: GRADING_TYPES.includes(q.grading_type) ? q.grading_type : 'points',
    submission_types: ['external_tool'],
    external_tool_tag_attributes: { url: launchUrl(q.id), new_tab: false },
    due_at: iso(everyone?.due), unlock_at: iso(everyone?.unlock), lock_at: iso(everyone?.lock),
    only_visible_to_overrides: !everyone,
    ...(q.group_id ? { assignment_group_id: Number(q.group_id) || q.group_id } : {}),
    ...(published !== undefined ? { published: !!published } : {}),
  };
  let a;
  if (q.assignment_id) a = await api.put(`/api/v1/courses/${cid}/assignments/${q.assignment_id}`, { assignment });
  else a = await api.post(`/api/v1/courses/${cid}/assignments`, { assignment: { ...assignment, published: !!published } });
  // Replace the overrides this quiz manages (sections / individual students).
  const oldIds = JSON.parse(q.override_ids || '[]');
  for (const oid of oldIds) { try { await api.del(`/api/v1/courses/${cid}/assignments/${a.id}/overrides/${oid}`); } catch { /* already gone */ } }
  const newIds = [];
  for (const r of others) {
    const sections = r.targets.filter((t) => t.startsWith('section:')).map((t) => t.slice(8));
    const students = r.targets.filter((t) => t.startsWith('student:')).map((t) => t.slice(8));
    const dates = { due_at: iso(r.due), unlock_at: iso(r.unlock), lock_at: iso(r.lock) };
    for (const s of sections) newIds.push((await api.post(`/api/v1/courses/${cid}/assignments/${a.id}/overrides`, { assignment_override: { course_section_id: Number(s) || s, ...dates } })).id);
    if (students.length) newIds.push((await api.post(`/api/v1/courses/${cid}/assignments/${a.id}/overrides`, { assignment_override: { student_ids: students.map((x) => Number(x) || x), title: `${students.length} student${students.length === 1 ? '' : 's'}`, ...dates } })).id);
  }
  // Group name for the students' list (they can't call the API themselves).
  const gid = a.assignment_group_id ? String(a.assignment_group_id) : q.group_id;
  let gname = q.group_name;
  try { gname = (await api.list(`/api/v1/courses/${cid}/assignment_groups`)).find((g) => String(g.id) === gid)?.name || gname; } catch { /* keep */ }
  db.prepare(`UPDATE course_quizzes SET assignment_id = ?, canvas_course_id = ?, title = ?, points = ?, published = ?, group_id = ?, group_name = ?,
    due_at = ?, unlock_at = ?, lock_at = ?, override_ids = ? WHERE id = ?`)
    .run(String(a.id), String(cid), title, points, a.published ? 1 : 0, gid, gname,
      a.due_at || null, a.unlock_at || null, a.lock_at || null, JSON.stringify(newIds), q.id);
  return a;
}

// Course assignment groups (and whether they're weighted), for the list and the editor.
async function courseGroups(l) {
  const api = canvasApi(l);
  const cid = l.canvasCourseId;
  const [course, groups] = await Promise.all([api.get(`/api/v1/courses/${cid}`), api.list(`/api/v1/courses/${cid}/assignment_groups`)]);
  return { weighted: !!course.apply_assignment_group_weights, groups: groups.map((g) => ({ id: String(g.id), name: g.name, weight: g.group_weight ?? 0, position: g.position ?? 0 })).sort((a, b) => a.position - b.position) };
}

// ---------- lists ----------
quizzesRouter.get('/api/quizzes', requireSession, async (req, res) => {
  const l = req.session.lti;
  if (!inCourse(l)) return res.status(400).json({ error: 'Open quizzes from the course menu in ReachLMS.' });
  const rows = courseQuizzes(l);
  const base = apiBaseFor(l);
  if (!l.instructor) {
    // Students: published quizzes, opened on their assignment page in ReachLMS.
    const out = rows.filter((q) => q.published && q.assignment_id).map((q) => {
      const c = contentOf(q); const g = c ? gradingFor(c.type, JSON.parse(c.data)) : {};
      const mine = db.prepare('SELECT score FROM submissions WHERE resource_link_id = ? AND sub = ? ORDER BY attempt').all(quizKey(q.id), l.sub);
      const scored = mine.filter((m) => m.score !== null).map((m) => m.score);
      const counted = g.keep === 'latest' ? (mine.at(-1)?.score ?? null) : (scored.length ? Math.max(...scored) : null);
      return { id: q.id, title: q.title, points: q.points, group: q.group_name || 'Assignments', due: q.due_at, unlock: q.unlock_at, lock: q.lock_at,
        questions: c ? (JSON.parse(c.data).questions || []).length : 0, attempts: g.attempts || 0, used: mine.length, score: g.showScore ? counted : null,
        url: base && q.canvas_course_id ? `${base}/courses/${q.canvas_course_id}/assignments/${q.assignment_id}` : null };
    });
    return res.json({ course: l.context, label: config.quizNavLabel, quizzes: out });
  }
  const status = { configured: apiConfigured(), connected: isConnected(l), courseKnown: !!l.canvasCourseId, signedIn: !!req.session.userId };
  let groups = { weighted: false, groups: [] };
  if (status.configured && status.connected && l.canvasCourseId) {
    try {
      groups = await courseGroups(l);
      // Pick up changes made in ReachLMS (dates, publish, group) since the last visit.
      const live = await canvasApi(l).list(`/api/v1/courses/${l.canvasCourseId}/assignments`);
      const byId = new Map(live.map((a) => [String(a.id), a]));
      for (const q of rows.filter((x) => x.assignment_id)) {
        const a = byId.get(q.assignment_id);
        if (!a) continue;
        const gname = groups.groups.find((g) => g.id === String(a.assignment_group_id))?.name || null;
        db.prepare('UPDATE course_quizzes SET published = ?, due_at = ?, unlock_at = ?, lock_at = ?, group_id = ?, group_name = ?, points = ?, title = ? WHERE id = ?')
          .run(a.published ? 1 : 0, a.due_at, a.unlock_at, a.lock_at, String(a.assignment_group_id), gname, a.points_possible, a.name, q.id);
      }
    } catch (e) { if (e.needsAuth) status.connected = false; else status.error = e.message; }
  }
  const fresh = courseQuizzes(l);
  res.json({ ...status, course: l.context, label: config.quizNavLabel, ...groups, quizzes: fresh.map((q) => {
    const c = contentOf(q);
    const subs = db.prepare('SELECT COUNT(DISTINCT sub) n FROM submissions WHERE resource_link_id = ?').get(quizKey(q.id));
    return { id: q.id, title: q.title, points: q.points, published: !!q.published, inCanvas: !!q.assignment_id, groupId: q.group_id, group: q.group_name,
      due: q.due_at, unlock: q.unlock_at, lock: q.lock_at, questions: c ? (JSON.parse(c.data).questions || []).length : 0, students: subs.n, missing: !c };
  }) });
});

// ---------- create / edit ----------
const emptyQuiz = () => ({ description: '', questions: [], grading: { attempts: 1, keep: 'best', showFeedback: true, showScore: true, showAnswers: false }, settings: { shuffleQuestions: false } });

quizzesRouter.post('/api/quizzes', requireTeacher, async (req, res) => {
  const l = req.session.lti;
  const title = String(req.body?.title || '').trim().slice(0, 200) || 'Untitled quiz';
  const contentId = newId(12); const id = newId(10);
  db.prepare("INSERT INTO contents (id, user_id, type, title, data) VALUES (?, ?, 'rqquiz', ?, ?)").run(contentId, req.session.userId, title, JSON.stringify(emptyQuiz()));
  const pos = (db.prepare('SELECT MAX(position) m FROM course_quizzes WHERE context_id = ?').get(l.contextId).m ?? -1) + 1;
  db.prepare('INSERT INTO course_quizzes (id, platform_id, context_id, content_id, title, points, created_by, position, canvas_course_id, group_id) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)')
    .run(id, l.platformId, l.contextId, contentId, title, req.session.userId, pos, l.canvasCourseId, req.body?.groupId ? String(req.body.groupId) : null);
  // Like Canvas: a new quiz is an unpublished assignment straight away.
  try {
    await syncAssignment(l, findQuiz(l, id), { title, points: 0, description: '', published: false });
    res.json({ id });
  } catch (e) {
    db.prepare('DELETE FROM course_quizzes WHERE id = ?').run(id);
    db.prepare('DELETE FROM contents WHERE id = ?').run(contentId);
    sendError(res, e);
  }
});

quizzesRouter.get('/api/quizzes/:id', requireTeacher, async (req, res) => {
  const l = req.session.lti;
  const q = findQuiz(l, req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found.' });
  const c = contentOf(q);
  if (!c) return res.status(404).json({ error: 'This quiz\'s content was deleted.' });
  try {
    const api = canvasApi(l); const cid = courseId(l, q);
    const [groups, sections, students] = await Promise.all([
      courseGroups(l), api.list(`/api/v1/courses/${cid}/sections`),
      api.list(`/api/v1/courses/${cid}/users?enrollment_type[]=student`),
    ]);
    res.json({
      id: q.id, title: c.title, data: JSON.parse(c.data), published: !!q.published, groupId: q.group_id, gradingType: q.grading_type || 'points',
      assign: JSON.parse(q.assign || '[]'), ...groups,
      sections: sections.map((s) => ({ id: String(s.id), name: s.name })), students: students.map((s) => ({ id: String(s.id), name: s.sortable_name || s.name })),
    });
  } catch (e) { sendError(res, e); }
});

quizzesRouter.put('/api/quizzes/:id', requireTeacher, async (req, res) => {
  const l = req.session.lti;
  const q = findQuiz(l, req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found.' });
  const c = contentOf(q);
  const b = req.body || {};
  const title = String(b.title || c.title).trim().slice(0, 200) || 'Untitled quiz';
  const data = b.data && typeof b.data === 'object' ? b.data : JSON.parse(c.data);
  db.prepare("UPDATE contents SET title = ?, data = ?, updated_at = datetime('now') WHERE id = ?").run(title, JSON.stringify(data), c.id);
  if (b.groupId !== undefined) db.prepare('UPDATE course_quizzes SET group_id = ? WHERE id = ?').run(b.groupId ? String(b.groupId) : null, q.id);
  if (b.gradingType !== undefined && GRADING_TYPES.includes(b.gradingType)) db.prepare('UPDATE course_quizzes SET grading_type = ? WHERE id = ?').run(b.gradingType, q.id);
  if (Array.isArray(b.assign)) db.prepare('UPDATE course_quizzes SET assign = ? WHERE id = ?').run(JSON.stringify(b.assign.slice(0, 50)), q.id);
  try {
    const a = await syncAssignment(l, findQuiz(l, q.id), { title, points: totalPoints(data), description: data.description || '', published: b.published });
    res.json({ ok: true, published: !!a.published, points: totalPoints(data) });
  } catch (e) { sendError(res, e); }
});

quizzesRouter.post('/api/quizzes/:id/publish', requireTeacher, async (req, res) => {
  const l = req.session.lti;
  const q = findQuiz(l, req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found.' });
  try {
    const a = await canvasApi(l).put(`/api/v1/courses/${courseId(l, q)}/assignments/${q.assignment_id}`, { assignment: { published: !!req.body?.published } });
    db.prepare('UPDATE course_quizzes SET published = ? WHERE id = ?').run(a.published ? 1 : 0, q.id);
    res.json({ published: !!a.published });
  } catch (e) { sendError(res, e); }
});

quizzesRouter.delete('/api/quizzes/:id', requireTeacher, async (req, res) => {
  const l = req.session.lti;
  const q = findQuiz(l, req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found.' });
  try {
    if (q.assignment_id) {
      try { await canvasApi(l).del(`/api/v1/courses/${courseId(l, q)}/assignments/${q.assignment_id}`); } catch (e) { if (!/\(404\)/.test(e.message)) throw e; }
    }
    db.prepare('DELETE FROM course_quizzes WHERE id = ?').run(q.id);
    res.json({ ok: true });
  } catch (e) { sendError(res, e); }
});

quizzesRouter.get('/api/quizzes/:id/results', requireTeacher, (req, res) => {
  const q = findQuiz(req.session.lti, req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found.' });
  const rows = db.prepare('SELECT id, sub, user_name, attempt, mode, score, sent_score, max_score, passback, created_at FROM submissions WHERE resource_link_id = ? ORDER BY sub, attempt').all(quizKey(q.id));
  const bySub = new Map();
  rows.forEach((r) => { if (!bySub.has(r.sub)) bySub.set(r.sub, []); bySub.get(r.sub).push({ id: r.id, attempt: r.attempt, mode: r.mode, score: r.score, sent: r.sent_score, max: r.max_score, passback: r.passback, at: r.created_at, name: r.user_name }); });
  res.json({ students: [...bySub.values()].map((list) => ({ name: list.at(-1).name || 'Student', attempts: list })) });
});

// Teacher preview of a quiz (as students will see it; nothing is recorded).
quizzesRouter.post('/api/quizzes/:id/open', requireTeacher, (req, res) => {
  const l = req.session.lti;
  const q = findQuiz(l, req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found.' });
  const backUrl = `/quiz/teach?t=${encodeURIComponent(req.session.token)}`;
  const token = playerSession({ lti: { ...l, kind: undefined, backUrl, preview: true }, userId: req.session.userId, quiz: { ...q, lineitem: null }, asTeacher: false });
  res.json({ url: `/quiz/play?t=${encodeURIComponent(token)}` });
});

quizzesRouter.get('/quiz/teach', (req, res) => {
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(String(req.query.t || ''));
  const l = row?.lti ? JSON.parse(row.lti) : null;
  if (!l || l.kind !== 'quizzes' || row.expires_at < Date.now()) return res.status(401).send(views.message('Session expired', 'Open Quizzes+ again from the course menu.'));
  res.send(views.quizzesTeacher(row.token));
});

quizzesRouter.get('/quiz/list', (req, res) => {
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(String(req.query.t || ''));
  const l = row?.lti ? JSON.parse(row.lti) : null;
  if (!l || l.kind !== 'quizlist' || row.expires_at < Date.now()) return res.status(401).send(views.message('Session expired', 'Open the quizzes again from the course menu.'));
  res.send(views.quizzes(row.token));
});

quizzesRouter.get('/quiz/play', (req, res) => {
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(String(req.query.t || ''));
  const l = row?.lti ? JSON.parse(row.lti) : null;
  if (!l?.quizId || row.expires_at < Date.now()) return res.status(401).send(views.message('Session expired', 'Open the quiz again from the course menu.'));
  const quiz = db.prepare('SELECT * FROM course_quizzes WHERE id = ?').get(l.quizId);
  const content = quiz && db.prepare('SELECT * FROM contents WHERE id = ?').get(quiz.content_id);
  if (!content) return res.status(404).send(views.message('Quiz not found', 'This quiz may have been removed.'));
  res.send(views.player(row.token, content, {
    canEdit: false, graded: !!l.ags, teacher: !!l.teacherAssignment, preview: !!l.preview,
    grading: gradingFor(content.type, JSON.parse(content.data)), back: l.backUrl || '',
  }));
});
