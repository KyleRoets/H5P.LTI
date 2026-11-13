// ReachQuizzes: a course menu item ("Quizzes+" by default) with quizzes built from ReachStudio
// activities. Each published quiz is an AGS line item, which ReachLMS turns into an External Tool
// assignment (gradebook column, Assignments page, SpeedGrader). Attempts, snapshots, hidden
// marking and SpeedGrader review reuse the assignment machinery (resource link key "quiz:<id>").
import express from 'express';
import { db, newId } from './db.js';
import { config } from './config.js';
import { createSession, requireSession, requireUser } from './sessions.js';
import { views } from './views.js';
import { gradingFor, TYPES } from './types.js';
import { createLineItem, deleteLineItem, getLineItem, updateLineItem } from './lti.js';

const launchUrl = (quizId) => `${config.publicUrl}/lti/launch?app=quizzes&quiz=${encodeURIComponent(quizId)}`;
const platformOf = (id) => db.prepare('SELECT * FROM platforms WHERE id = ?').get(id);
const sameSite = (a, b) => a === b || (platformOf(a)?.issuer && platformOf(a)?.issuer === platformOf(b)?.issuer);
const quizKey = (id) => `quiz:${id}`;

/** Player session for one quiz attempt (same shape as an assignment launch). */
function playerSession({ lti, userId, quiz, asTeacher }) {
  const s = {
    ...lti,
    kind: 'player',
    contentId: quiz.content_id,
    resourceLinkId: quizKey(quiz.id),
    quizId: quiz.id,
    quizBack: true,
  };
  if (asTeacher) s.teacherAssignment = true;
  else if (quiz.lineitem) s.ags = { lineitem: quiz.lineitem };
  return createSession(userId, s);
}

function renderQuizPlayer(res, { lti, userId, quiz, asTeacher }) {
  const content = db.prepare('SELECT * FROM contents WHERE id = ?').get(quiz.content_id);
  if (!content) return res.status(404).send(views.message('Quiz not found', 'The activity behind this quiz has been deleted. Ask your teacher to add it again.'));
  const token = playerSession({ lti, userId, quiz, asTeacher });
  const canEdit = !!userId && userId === content.user_id;
  return res.send(views.player(token, content, {
    canEdit, graded: !asTeacher && !!quiz.lineitem, teacher: !!asTeacher,
    grading: gradingFor(content.type, JSON.parse(content.data)),
  }));
}

/** LTI launch for the ReachQuizzes registration (course menu) or a quiz's assignment. */
export function quizLaunch(res, { lti, userId, quizId, ags }) {
  lti.app = 'quizzes';
  if (ags?.lineitems) lti.lineitems = ags.lineitems;
  if (quizId) {
    const quiz = db.prepare('SELECT * FROM course_quizzes WHERE id = ?').get(quizId);
    if (!quiz || !sameSite(quiz.platform_id, lti.platformId)) return res.status(404).send(views.message('Quiz not found', 'This quiz may have been removed from the course.'));
    // Opened from the assignment: the launch carries the line item for the score.
    if (ags?.lineitem && !quiz.lineitem) db.prepare('UPDATE course_quizzes SET lineitem = ? WHERE id = ?').run(ags.lineitem, quiz.id);
    if (ags?.lineitem) quiz.lineitem = ags.lineitem;
    return renderQuizPlayer(res, { lti, userId, quiz, asTeacher: lti.instructor });
  }
  if (!lti.contextId) return res.status(400).send(views.message(config.quizToolName, 'Open quizzes from a course.'));
  if (lti.instructor) {
    lti.kind = 'quizzes';
    return res.send(views.studio(createSession(userId, lti)));
  }
  lti.kind = 'quizlist';
  return res.send(views.quizzes(createSession(userId, lti)));
}

export const quizzesRouter = express.Router();
quizzesRouter.use('/api/quizzes', express.json());

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
const contentOf = (q) => db.prepare('SELECT id, type, title, data, user_id, updated_at FROM contents WHERE id = ?').get(q.content_id);
const attemptsFor = (q, sub) => db.prepare(`SELECT attempt, mode, score, sent_score, max_score, created_at FROM submissions WHERE resource_link_id = ? ${sub ? 'AND sub = ?' : ''} ORDER BY attempt`)
  .all(...[quizKey(q.id), sub].filter(Boolean));

// Dates come from the assignment in ReachLMS (the teacher sets them there); cached for a minute.
const dateCache = new Map();
async function datesFor(q) {
  if (!q.lineitem) return {};
  const hit = dateCache.get(q.id);
  if (hit && hit.at > Date.now() - 60_000) return hit.d;
  let d = {};
  try { const li = await getLineItem(platformOf(q.platform_id), q.lineitem); d = { start: li?.startDateTime || null, end: li?.endDateTime || null, points: li?.scoreMaximum ?? null }; } catch { /* offline: no dates */ }
  dateCache.set(q.id, { at: Date.now(), d });
  return d;
}

// ---------- teacher ----------
quizzesRouter.get('/api/quizzes', requireSession, async (req, res) => {
  const l = req.session.lti;
  if (!inCourse(l)) return res.status(400).json({ error: 'Open quizzes from the course menu in ReachLMS.' });
  const list = courseQuizzes(l);
  if (l.instructor) {
    return res.json({ course: l.context, label: config.quizNavLabel, canPublish: !!l.lineitems, quizzes: await Promise.all(list.map(async (q) => {
      const c = contentOf(q);
      const g = c ? gradingFor(c.type, JSON.parse(c.data)) : null;
      const subs = db.prepare('SELECT COUNT(DISTINCT sub) n, COUNT(*) a FROM submissions WHERE resource_link_id = ?').get(quizKey(q.id));
      return { id: q.id, title: q.title, contentId: q.content_id, type: c?.type, missing: !c, published: !!q.lineitem, points: g?.max ?? q.points,
        mode: g?.mode, attempts: g?.attempts, students: subs.n, submissions: subs.a, ...(await datesFor(q)), owner: c?.user_id === req.session.userId };
    })) });
  }
  // Students: published quizzes with their own status (scores only if the quiz shows them).
  const out = [];
  for (const q of list.filter((x) => x.lineitem)) {
    const c = contentOf(q); if (!c) continue;
    const g = gradingFor(c.type, JSON.parse(c.data));
    const mine = attemptsFor(q, l.sub);
    const scored = mine.filter((a) => a.score !== null);
    const best = scored.length ? Math.max(...scored.map((a) => a.score)) : null;
    const counted = g.keep === 'latest' ? (mine.at(-1)?.score ?? null) : best;
    out.push({ id: q.id, title: q.title, type: c.type, points: g.max, mode: g.mode, attempts: g.attempts, used: mine.length,
      score: g.showScore ? counted : null, lastAt: mine.at(-1)?.created_at || null, ...(await datesFor(q)) });
  }
  res.json({ course: l.context, label: config.quizNavLabel, quizzes: out });
});

// Add a library item to the course as a draft quiz (not visible to students yet).
quizzesRouter.post('/api/quizzes', requireTeacher, (req, res) => {
  const l = req.session.lti;
  const c = db.prepare('SELECT * FROM contents WHERE id = ? AND user_id = ?').get(req.body?.contentId, req.session.userId);
  if (!c) return res.status(404).json({ error: 'Content not found in your library.' });
  const id = newId(10);
  const pos = (db.prepare('SELECT MAX(position) m FROM course_quizzes WHERE context_id = ?').get(l.contextId).m ?? -1) + 1;
  db.prepare('INSERT INTO course_quizzes (id, platform_id, context_id, content_id, title, points, created_by, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, l.platformId, l.contextId, c.id, c.title, gradingFor(c.type, JSON.parse(c.data)).max, req.session.userId, pos);
  res.json({ id });
});

// Publish: create the assignment in ReachLMS (or update its name and points if it exists).
quizzesRouter.post('/api/quizzes/:id/publish', requireTeacher, async (req, res) => {
  const l = req.session.lti;
  const q = findQuiz(l, req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found.' });
  const c = contentOf(q);
  if (!c) return res.status(404).json({ error: 'The activity behind this quiz was deleted.' });
  const g = gradingFor(c.type, JSON.parse(c.data));
  const platform = platformOf(l.platformId);
  try {
    if (q.lineitem) {
      const li = await getLineItem(platformOf(q.platform_id), q.lineitem);
      await updateLineItem(platformOf(q.platform_id), q.lineitem, { ...li, label: c.title, scoreMaximum: g.max });
    } else {
      if (!l.lineitems) return res.status(400).json({ error: 'ReachLMS did not allow ReachQuizzes to create assignments. Ask your administrator to check the ReachQuizzes developer key has the line item scope switched on.' });
      const li = await createLineItem(platform, l.lineitems, { label: c.title, scoreMaximum: g.max, resourceId: q.id, launchUrl: launchUrl(q.id) });
      if (!li?.id) throw new Error('ReachLMS did not return the new assignment.');
      db.prepare("UPDATE course_quizzes SET lineitem = ?, published_at = datetime('now') WHERE id = ?").run(li.id, q.id);
    }
    db.prepare('UPDATE course_quizzes SET title = ?, points = ? WHERE id = ?').run(c.title, g.max, q.id);
    dateCache.delete(q.id);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(502).json({ error: e.message }); }
});

// Remove from the course. Deleting a published quiz deletes its assignment and grades in ReachLMS.
quizzesRouter.delete('/api/quizzes/:id', requireTeacher, async (req, res) => {
  const l = req.session.lti;
  const q = findQuiz(l, req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found.' });
  if (q.lineitem) {
    try { await deleteLineItem(platformOf(q.platform_id), q.lineitem); } catch (e) {
      if (!/\(404\)/.test(e.message)) return res.status(502).json({ error: e.message });
    }
  }
  db.prepare('DELETE FROM course_quizzes WHERE id = ?').run(q.id);
  res.json({ ok: true });
});

// Lecturer's results for one quiz (same shape as an assignment's results).
quizzesRouter.get('/api/quizzes/:id/results', requireTeacher, (req, res) => {
  const q = findQuiz(req.session.lti, req.params.id);
  if (!q) return res.status(404).json({ error: 'Quiz not found.' });
  const rows = db.prepare('SELECT id, sub, user_name, attempt, mode, score, sent_score, max_score, passback, created_at FROM submissions WHERE resource_link_id = ? ORDER BY sub, attempt').all(quizKey(q.id));
  const bySub = new Map();
  rows.forEach((r) => { if (!bySub.has(r.sub)) bySub.set(r.sub, []); bySub.get(r.sub).push({ id: r.id, attempt: r.attempt, mode: r.mode, score: r.score, sent: r.sent_score, max: r.max_score, passback: r.passback, at: r.created_at, name: r.user_name }); });
  res.json({ students: [...bySub.values()].map((list) => ({ name: list.at(-1).name || 'Student', attempts: list })) });
});

// Open a quiz (student: take it; teacher: preview with results) in this frame.
quizzesRouter.post('/api/quizzes/:id/open', requireSession, (req, res) => {
  const l = req.session.lti;
  if (!inCourse(l)) return res.status(400).json({ error: 'Open quizzes from the course menu in ReachLMS.' });
  const q = findQuiz(l, req.params.id);
  if (!q || (!l.instructor && !q.lineitem)) return res.status(404).json({ error: 'Quiz not found.' });
  // "All quizzes" goes back to a fresh list (teachers: the studio's course quizzes).
  const backUrl = l.instructor ? `/studio?t=${encodeURIComponent(req.session.token)}#quizzes` : `/quiz/list?t=${encodeURIComponent(req.session.token)}`;
  const token = playerSession({ lti: { ...l, kind: undefined, backUrl }, userId: req.session.userId, quiz: q, asTeacher: l.instructor });
  res.json({ url: `/quiz/play?t=${encodeURIComponent(token)}` });
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
    canEdit: false, graded: !!l.ags, teacher: !!l.teacherAssignment,
    grading: gradingFor(content.type, JSON.parse(content.data)), back: l.backUrl || '',
  }));
});

export const quizTypesGraded = () => Object.entries(TYPES).filter(([, t]) => t.maxScore).map(([id]) => id);
