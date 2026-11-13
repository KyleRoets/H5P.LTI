// End-to-end LTI 1.3 test: real Reach Studio server + mock ReachLMS (Canvas) platform.
// Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TOOL_PORT = 3101;
const MOCK_PORT = 4101;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-studio-test-'));
Object.assign(process.env, {
  DATA_DIR: tmp, PUBLIC_URL: `http://localhost:${TOOL_PORT}`, ALLOW_INSECURE_PLATFORMS: 'true', PORT: String(TOOL_PORT), ADMIN_EMAILS: 'taylor@school.test', STORAGE_QUOTA_MB: '1', CANVAS_API_CLIENT_ID: 'mock-api-key', CANVAS_API_CLIENT_SECRET: 'mock-api-secret',
});
const { createApp } = await import('../src/server.js');
const { startMockCanvas } = await import('./mock-canvas.js');

const TOOL = `http://localhost:${TOOL_PORT}`;
const app = await createApp();
const toolServer = await new Promise((r) => { const s = app.listen(TOOL_PORT, () => r(s)); });
const mock = await startMockCanvas({ port: MOCK_PORT, toolUrl: TOOL });

let passed = 0;
const results = [];
async function step(name, fn) {
  try { await fn(); passed++; results.push(`  ✓ ${name}`); } catch (e) { results.push(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 6).join('\n      ')}`); throw e; }
}
const form = (o) => new URLSearchParams(o);
const field = (html, name) => html.match(new RegExp(`name="${name}" value="([^"]*)"`))?.[1]?.replace(/&amp;/g, '&');
const bootToken = (html) => JSON.parse(html.match(/window\.BOOT=(\{.*?\})<\/script>/)[1]).token;
const boot = (html) => JSON.parse(html.match(/window\.BOOT=(\{.*?\})<\/script>/)[1]);
const api = (token) => {
  const fn = async (method, p, body) => {
    const res = await fetch(TOOL + p, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  fn.__token = token;
  return fn;
};

// Simulates the browser: login initiation -> platform auth -> form_post launch.
async function launch(hint, as = 'teacher', { tamper = false, replay = false, quizzes = false } = {}) {
  const st = await (await fetch(`${mock.base}/state`)).json();
  assert.ok(st.registered, 'tool must be registered first');
  const clientId = (quizzes ? mock.state.quizRegistration : mock.state.registration).client_id;
  const r1 = await fetch(`${TOOL}/lti/login`, { method: 'POST', redirect: 'manual', body: form({ iss: mock.base, login_hint: as, client_id: clientId, lti_deployment_id: 'deployment-1', target_link_uri: `${TOOL}/lti/launch`, lti_message_hint: hint }) });
  assert.equal(r1.status, 302);
  const authUrl = new URL(r1.headers.get('location'));
  assert.equal(authUrl.origin + authUrl.pathname, `${mock.base}/api/lti/authorize_redirect`);
  for (const k of ['state', 'nonce', 'login_hint', 'redirect_uri', 'client_id']) assert.ok(authUrl.searchParams.get(k), `auth request has ${k}`);
  assert.equal(authUrl.searchParams.get('response_mode'), 'form_post');
  const r2 = await fetch(authUrl);
  const html2 = await r2.text();
  assert.equal(r2.status, 200, html2);
  let idToken = field(html2, 'id_token');
  const state = field(html2, 'state');
  if (tamper) idToken = idToken.slice(0, -4) + (idToken.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  const r3 = await fetch(`${TOOL}/lti/launch`, { method: 'POST', body: form({ id_token: idToken, state }) });
  const out = { status: r3.status, html: await r3.text(), state, idToken };
  if (replay) {
    const again = await fetch(`${TOOL}/lti/launch`, { method: 'POST', body: form({ id_token: idToken, state }) });
    out.replayStatus = again.status;
  }
  return out;
}

try {
  await step('serves tool JWKS and Canvas JSON config', async () => {
    const jwks = await (await fetch(`${TOOL}/.well-known/jwks.json`)).json();
    assert.equal(jwks.keys.length, 1); assert.ok(!jwks.keys[0].d, 'no private key material');
    const cfg = await (await fetch(`${TOOL}/lti/canvas-config.json`)).json();
    const placements = cfg.extensions[0].settings.placements.map((p) => `${p.placement}:${p.message_type}`);
    assert.deepEqual(placements, ['editor_button:LtiDeepLinkingRequest', 'assignment_selection:LtiDeepLinkingRequest', 'submission_type_selection:LtiDeepLinkingRequest', 'link_selection:LtiDeepLinkingRequest', 'course_navigation:LtiResourceLinkRequest']);
    const byName = Object.fromEntries(cfg.extensions[0].settings.placements.map((p) => [p.placement, p]));
    assert.equal(byName.editor_button.selection_width, 1200);
    assert.equal(byName.course_navigation.display_type, 'default');
    assert.ok(!byName.course_navigation.windowTarget, 'never a new window');
  });

  await step('rejects launches from an unregistered platform', async () => {
    const r = await fetch(`${TOOL}/lti/login`, { method: 'POST', redirect: 'manual', body: form({ iss: 'https://evil.example', login_hint: 'x', client_id: '1' }) });
    assert.equal(r.status, 400);
  });

  await step('Dynamic Registration installs the tool into the platform', async () => {
    const q = form({ openid_configuration: `${mock.base}/api/lti/security/openid-configuration`, registration_token: mock.state.regToken });
    const page = await (await fetch(`${TOOL}/lti/register?${q}`)).text();
    assert.match(page, /Install ReachStudio/);
    const r = await fetch(`${TOOL}/lti/register`, { method: 'POST', body: q });
    const html = await r.text();
    assert.equal(r.status, 200, html);
    assert.match(html, /is registered/);
    const p = mock.state.registration.payload;
    const msgs = p['https://purl.imsglobal.org/spec/lti-tool-configuration'].messages;
    assert.deepEqual(msgs.map((m) => m.placements[0]), ['editor_button', 'assignment_selection', 'submission_type_selection', 'link_selection', 'course_navigation']);
    assert.equal(msgs[0]['https://canvas.instructure.com/lti/launch_width'], 1200, 'large editor pop-up');
    assert.equal(msgs[0]['https://canvas.instructure.com/lti/launch_height'], 900);
    assert.equal(msgs.at(-1)['https://canvas.instructure.com/lti/display_type'], 'default', 'course navigation opens inside ReachLMS');
    assert.equal(p.token_endpoint_auth_method, 'private_key_jwt');
    assert.deepEqual(p.redirect_uris, [`${TOOL}/lti/launch`]);
  });

  let teacher; let quizId; let hotspotId; let other; let otherId;
  await step('editor_button deep-link launch opens the studio and asks for an account', async () => {
    const l = await launch('dl:editor_button');
    assert.equal(l.status, 200, l.html);
    teacher = api(bootToken(l.html));
    const me = await teacher('GET', '/api/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user, null, 'no account yet');
    assert.equal(me.body.lti.canEmbed, true);
    assert.equal(me.body.lti.placement, 'editor_button');
    assert.equal(me.body.lti.email, 'taylor@school.test');
    const blocked = await teacher('GET', '/api/contents');
    assert.equal(blocked.status, 401); assert.equal(blocked.body.needsAuth, true);
  });

  await step('teacher creates an account, linked to their ReachLMS identity', async () => {
    const bad = await teacher('POST', '/api/auth/signup', { name: 'Taylor', email: 'taylor@school.test', password: 'short' });
    assert.equal(bad.status, 400);
    const r = await teacher('POST', '/api/auth/signup', { name: 'Taylor Teacher', email: 'taylor@school.test', password: 'correct horse battery' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.user.email, 'taylor@school.test');
    const dup = await teacher('POST', '/api/auth/signup', { name: 'Xavier', email: 'TAYLOR@school.test', password: 'whatever123' });
    assert.equal(dup.status, 409);
  });

  await step('library: folders, create, update, search, duplicate, move, delete', async () => {
    const f = await teacher('POST', '/api/folders', { name: 'Biology' });
    assert.equal(f.status, 200);
    const quiz = await teacher('POST', '/api/contents', { type: 'quiz', title: 'Cell quiz', folderId: f.body.id, data: { passPercent: 50, questions: [
      { kind: 'choice', text: 'Powerhouse of the cell?', options: [{ text: 'Mitochondria', correct: true }, { text: 'Nucleus', correct: false }] },
      { kind: 'truefalse', text: 'Plant cells have walls.', options: [{ text: 'True', correct: true }, { text: 'False', correct: false }] },
      { kind: 'choice', text: 'Pick the organelles', options: [{ text: 'Ribosome', correct: true }, { text: 'Golgi', correct: true }, { text: 'Laptop', correct: false }] },
    ] } });
    assert.equal(quiz.status, 200); quizId = quiz.body.id;
    const hs = await teacher('POST', '/api/contents', { type: 'hotspots', title: 'Cell diagram', data: { image: '/media/x.png', style: { width: 560 }, hotspots: [{ x: 10, y: 20, title: 'Nucleus', body: '<p>Holds <strong>DNA</strong></p>' }] } });
    hotspotId = hs.body.id;
    const badType = await teacher('POST', '/api/contents', { type: 'nope', title: 'x', data: {} });
    assert.equal(badType.status, 400);
    const upd = await teacher('PUT', `/api/contents/${quizId}`, { title: 'Cell quiz (v2)' });
    assert.equal(upd.body.title, 'Cell quiz (v2)'); assert.equal(upd.body.data.questions.length, 3);
    const search = await teacher('GET', '/api/contents?q=v2');
    assert.deepEqual(search.body.map((c) => c.id), [quizId]);
    const inFolder = await teacher('GET', `/api/contents?folder=${f.body.id}`);
    assert.equal(inFolder.body.length, 1);
    const dup = await teacher('POST', `/api/contents/${quizId}/duplicate`);
    assert.match(dup.body.title, /\(copy\)/);
    await teacher('PUT', `/api/contents/${dup.body.id}`, { folderId: null });
    assert.equal((await teacher('GET', '/api/contents?folder=none')).body.length, 2);
    await teacher('DELETE', `/api/contents/${dup.body.id}`);
    assert.equal((await teacher('GET', '/api/contents')).body.length, 2);
    const folders = await teacher('GET', '/api/folders');
    assert.equal(folders.body[0].count, 1);
  });

  await step('media upload accepts images and rejects other files', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'dot.png');
    const tok = teacher;
    const res = await fetch(`${TOOL}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${bootTokenOf(tok)}` }, body: fd });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body)); assert.match(body.url, /^\/media\/.+\.png$/);
    const get = await fetch(TOOL + body.url); assert.equal(get.status, 200); assert.equal(get.headers.get('content-type'), 'image/png');
    const fd2 = new FormData(); fd2.append('file', new Blob(['<svg onload=alert(1)>'], { type: 'image/svg+xml' }), 'x.svg');
    const bad = await fetch(`${TOOL}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${bootTokenOf(tok)}` }, body: fd2 });
    assert.equal(bad.status, 400);
    // Storage is measured from the files on disk; the 1 MB test quota blocks a bigger video.
    const st = await teacher('GET', '/api/storage');
    assert.equal(st.body.images, png.length); assert.equal(st.body.total, png.length); assert.equal(st.body.quota, 1024 * 1024);
    const fd3 = new FormData(); fd3.append('file', new Blob([Buffer.alloc(1100 * 1024)], { type: 'video/mp4' }), 'big.mp4');
    const over = await fetch(`${TOOL}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${bootTokenOf(tok)}` }, body: fd3 });
    assert.equal(over.status, 413, 'over the storage quota');
    assert.equal((await teacher('GET', '/api/storage')).body.total, png.length, 'rejected file is not kept');
    const fd4 = new FormData(); fd4.append('file', new Blob([Buffer.alloc(300 * 1024)], { type: 'video/mp4' }), 'clip.mp4');
    const ok = await fetch(`${TOOL}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${bootTokenOf(tok)}` }, body: fd4 });
    assert.equal(ok.status, 200);
    const st2 = (await teacher('GET', '/api/storage')).body;
    assert.equal(st2.video, 300 * 1024); assert.equal(st2.files, 2);
  });

  await step('embedding returns a signed deep-linking response the platform accepts (RCE iframe)', async () => {
    const r = await teacher('POST', '/api/embed', { contentId: hotspotId });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.returnUrl, `${mock.base}/deep_link_return?placement=editor_button`);
    const res = await fetch(r.body.returnUrl, { method: 'POST', body: form({ JWT: r.body.jwt }) });
    assert.equal(res.status, 200, await res.text());
    const item = mock.state.page[0];
    assert.equal(item.type, 'ltiResourceLink');
    assert.equal(item.custom.content_id, hotspotId);
    assert.equal(item.iframe.width, 560, 'RCE embed uses the author\'s chosen width');
    assert.equal(item.iframe.height, 392, 'height scales with the width');
    assert.ok(!item.lineItem, 'RCE embeds are not graded');
    assert.ok(mock.state.log.some((m) => m.includes('data=opaque-editor_button')), 'echoes the platform data claim');
  });

  await step('second launch signs the teacher in automatically (identity link)', async () => {
    const l = await launch('dl:editor_button');
    const me = await api(bootToken(l.html))('GET', '/api/me');
    assert.equal(me.body.user?.email, 'taylor@school.test');
  });

  await step('assignment_selection creates a graded assignment with a lineItem', async () => {
    const l = await launch('dl:assignment_selection');
    const t = api(bootToken(l.html));
    const r = await t('POST', '/api/embed', { contentId: quizId });
    await fetch(r.body.returnUrl, { method: 'POST', body: form({ JWT: r.body.jwt }) });
    const a = mock.state.assignments[0];
    assert.equal(a.lineItem.scoreMaximum, 3);
    assert.equal(a.lineItem.label, 'Cell quiz (v2)');
    assert.ok(a.item.iframe?.height > 0 && !a.item.window, 'assignments open inside the assignment page');
  });

  await step('student assignment launch shows the player and sends the grade via AGS', async () => {
    const l = await launch('rl:assign-0', 'student');
    assert.equal(l.status, 200, l.html);
    const b = boot(l.html);
    assert.equal(b.content.type, 'quiz'); assert.equal(b.graded, true); assert.equal(b.canEdit, false);
    assert.equal(b.grading.mode, 'auto'); assert.equal(b.grading.max, 3);
    const s = api(b.token);
    const nasty = '<div class="rs"><p>Answer<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a></p></div>';
    const forged = await s('POST', '/api/score', { score: 99, snapshot: nasty });
    assert.equal(forged.body.score, 3, 'score is clamped to the maximum');
    assert.equal(forged.body.passback, 'sent'); assert.equal(forged.body.used, 1);
    const r = await s('POST', '/api/score', { score: 2, snapshot: '<div class="rs"><p>Second try</p></div>' });
    assert.equal(r.body.passback, 'sent'); assert.equal(r.body.score, 2);
    assert.equal(r.body.sent, 3, 'best attempt counts by default');
    const score = mock.state.assignments[0].scores['user-student-1'];
    assert.equal(score.scoreGiven, 3); assert.equal(score.scoreMaximum, 3);
    assert.equal(score.activityProgress, 'Completed'); assert.equal(score.gradingProgress, 'FullyGraded');
    const subs = mock.state.assignments[0].submissions['user-student-1'];
    assert.equal(subs.length, 2, 'each attempt is a SpeedGrader submission');
    assert.equal(subs[1].type, 'basic_lti_launch');
    assert.match(subs[1].url, new RegExp(`^${TOOL}/lti/launch\\?review=${r.body.id}$`));
    const status = await s('GET', '/api/assignment');
    assert.equal(status.body.used, 2); assert.equal(status.body.counted, 3);
    const denied = await s('GET', '/api/contents');
    assert.equal(denied.status, 401, 'students have no library access');
  });

  await step('SpeedGrader opens the submitted attempt for the lecturer (sanitised snapshot)', async () => {
    const l = await launch('rl:sg-0.user-student-1', 'teacher');
    assert.equal(l.status, 200, l.html);
    assert.match(l.html, /review-page\.js/);
    const t = api(bootToken(l.html));
    const { id } = (await t('GET', '/api/review')).body;
    const r = await t('GET', `/api/submissions/${id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.submission.name, 'Sam Student'); assert.equal(r.body.submission.attempt, 2);
    assert.equal(r.body.attempts.length, 2);
    const first = await t('GET', `/api/submissions/${r.body.attempts[0].id}`);
    const snap = first.body.submission.snapshot;
    assert.match(snap, /Answer/);
    assert.doesNotMatch(snap, /<script|onerror|javascript:/i, 'active content is stripped');
    // A ReachLMS admin (no course role) can review it too; another student can't; unknown ids explain why.
    const la0 = await launch('rl:sg-0.user-student-1', 'admin');
    assert.equal(la0.status, 200, la0.html);
    const ta = api(bootToken(la0.html));
    const ra = await ta('GET', `/api/submissions/${(await ta('GET', '/api/review')).body.id}`);
    assert.equal(ra.status, 200); assert.equal(ra.body.submission.name, 'Sam Student');
    const other = await launch('rl:sg-0.user-student-1', 'student2');
    assert.equal(other.status, 403); assert.match(other.html, /role/);
    const own = await launch('rl:sg-0.user-student-1', 'student');
    assert.equal(own.status, 200, 'students can open their own submission details');
    // The lecturer opening the assignment itself gets the lecturer view and the results list.
    const la = await launch('rl:assign-0', 'teacher');
    const bt = boot(la.html);
    assert.equal(bt.teacher, true); assert.equal(bt.graded, false);
    const res = await api(bt.token)('GET', '/api/results');
    assert.equal(res.body.students.length, 1); assert.equal(res.body.students[0].attempts.length, 2);
    // Students can't list results.
    const ls = await launch('rl:assign-0', 'student');
    assert.equal((await api(boot(ls.html).token)('GET', '/api/results')).status, 403);
  });

  await step('student RCE embed launch renders without grading; owner sees an edit button', async () => {
    const l = await launch('rl:page-0', 'student');
    const b = boot(l.html);
    assert.equal(b.content.id, hotspotId); assert.equal(b.graded, false);
    const r = await api(b.token)('POST', '/api/score', { score: 1 });
    assert.equal(r.body.passback, 'none');
    const lt = await launch('rl:page-0', 'teacher');
    assert.equal(boot(lt.html).canEdit, true);
  });

  await step('course navigation: teachers get the library, students get a message', async () => {
    const t = await launch('nav:course', 'teacher');
    assert.match(t.html, /studio\.js/);
    const s = await launch('nav:course', 'student');
    assert.doesNotMatch(s.html, /studio\.js/);
  });

  await step('security: tampered id_token and replayed state are rejected', async () => {
    const t = await launch('dl:editor_button', 'teacher', { tamper: true });
    assert.equal(t.status, 400); assert.match(t.html, /Launch failed/);
    const r = await launch('dl:editor_button', 'teacher', { replay: true });
    assert.equal(r.status, 200); assert.equal(r.replayStatus, 400);
  });

  await step('accounts are private: another user cannot see or embed your content', async () => {
    const r = await fetch(`${TOOL}/api/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Other Teacher', email: 'other@school.test', password: 'another password' }) });
    const j = await r.json();
    other = api(j.token); otherId = j.user.id;
    assert.equal(j.user.role, 'teacher', 'new accounts are teachers');
    assert.equal((await other('GET', `/api/contents/${quizId}`)).status, 404);
    assert.equal((await other('GET', '/api/contents')).body.length, 0);
    assert.equal((await other('POST', '/api/embed', { contentId: quizId })).status, 400, 'no deep-link session');
    const bad = await fetch(`${TOOL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'taylor@school.test', password: 'wrong' }) });
    assert.equal(bad.status, 401);
  });

  await step('rich-text answers (<mark>) set the graded assignment\'s maximum score', async () => {
    const c = await teacher('POST', '/api/contents', { type: 'blanks', title: 'Cell words', data: { html: '<p>The <mark>nucleus</mark> holds <mark>DNA</mark>.</p>' } });
    const l = await launch('dl:assignment_selection');
    const t = api(bootToken(l.html));
    const r = await t('POST', '/api/embed', { contentId: c.body.id });
    await fetch(r.body.returnUrl, { method: 'POST', body: form({ JWT: r.body.jwt }) });
    assert.equal(mock.state.assignments.at(-1).lineItem.scoreMaximum, 2);
  });

  await step('lecturer-graded assignment: PendingManual in SpeedGrader, attempts limit enforced', async () => {
    const c = await teacher('POST', '/api/contents', { type: 'essay', title: 'Explain osmosis', data: { task: '<p>Explain osmosis.</p>', grading: { mode: 'manual', points: 20, attempts: 1 } } });
    const l = await launch('dl:submission_type_selection');
    const t = api(bootToken(l.html));
    const r = await t('POST', '/api/embed', { contentId: c.body.id });
    await fetch(r.body.returnUrl, { method: 'POST', body: form({ JWT: r.body.jwt }) });
    const idx = mock.state.assignments.length - 1;
    assert.equal(mock.state.assignments[idx].lineItem.scoreMaximum, 20, 'points from the Grading tab');
    const ls = await launch(`rl:assign-${idx}`, 'student');
    const b = boot(ls.html);
    assert.equal(b.grading.mode, 'manual'); assert.equal(b.grading.attempts, 1);
    const s = api(b.token);
    const sub = await s('POST', '/api/score', { score: 5, snapshot: '<div class="rs"><textarea>Water moves…</textarea></div>' });
    assert.equal(sub.status, 200); assert.equal(sub.body.score, null, 'no automatic score');
    const sc = mock.state.assignments[idx].scores['user-student-1'];
    assert.equal(sc.gradingProgress, 'PendingManual'); assert.equal(sc.activityProgress, 'Submitted');
    assert.equal(sc.scoreGiven, undefined);
    assert.equal(sc['https://canvas.instructure.com/lti/submission'].preserve_score, true, 'a grade already given is kept');
    assert.equal(mock.state.assignments[idx].submissions['user-student-1'].length, 1);
    const again = await s('POST', '/api/score', { snapshot: '<div class="rs">again</div>' });
    assert.equal(again.status, 409, 'only one attempt allowed');
    // Items with no right answers (hotspots) are lecturer-graded out of 10 points by default.
    const l2 = await launch('dl:assignment_selection');
    const r2 = await api(bootToken(l2.html))('POST', '/api/embed', { contentId: hotspotId });
    await fetch(r2.body.returnUrl, { method: 'POST', body: form({ JWT: r2.body.jwt }) });
    assert.equal(mock.state.assignments.at(-1).lineItem.scoreMaximum, 10);
  });

  await step('hidden marking: students get no score or right/wrong; SpeedGrader gets every answer', async () => {
    const c = await teacher('POST', '/api/contents', { type: 'quiz', title: 'Silent quiz', data: {
      questions: [
        { text: '<p>Powerhouse of the cell?</p>', options: [{ text: 'Mitochondrion', correct: true }, { text: 'Ribosome', correct: false }] },
        { text: '<p>Holds DNA?</p>', options: [{ text: 'Nucleus', correct: true }, { text: 'Vacuole', correct: false }] }],
      grading: { showFeedback: false, showScore: false } } });
    const l = await launch('dl:assignment_selection');
    const r = await api(bootToken(l.html))('POST', '/api/embed', { contentId: c.body.id });
    await fetch(r.body.returnUrl, { method: 'POST', body: form({ JWT: r.body.jwt }) });
    const idx = mock.state.assignments.length - 1;
    const ls = await launch(`rl:assign-${idx}`, 'student');
    const b = boot(ls.html);
    assert.equal(b.grading.showFeedback, false); assert.equal(b.grading.showScore, false);
    // Exam mode: the page gets the questions but not the answer key.
    assert.equal(b.secure, true);
    assert.ok(b.content.data.questions.every((q) => q.options.every((o) => !('correct' in o))), 'no answer key in the page');
    const s = api(b.token);
    // The page sends the choices; a claimed score is ignored and the server marks them.
    const responses = [{ key: 'q0', picked: [1], ok: true, correct: 'forged' }, { key: 'q1', picked: [0] }];
    const sub = await s('POST', '/api/score', { score: 2, snapshot: '<div class="rs">done</div>', responses });
    assert.equal(sub.status, 200);
    assert.equal(sub.body.score, null, 'score hidden from the student'); assert.equal(sub.body.counted, null);
    assert.equal(mock.state.assignments[idx].scores['user-student-1'].scoreGiven, 1, 'but the gradebook gets it');
    const own = await s('GET', `/api/submissions/${sub.body.id}`);
    assert.equal(own.body.submission.score, null);
    assert.ok(own.body.submission.responses.every((x) => x.correct === '' && x.ok === null), 'no correct answers for the student');
    const sg = await launch(`rl:sg-${idx}.user-student-1`, 'teacher');
    const t = api(bootToken(sg.html));
    const rv = await t('GET', `/api/submissions/${(await t('GET', '/api/review')).body.id}`);
    assert.equal(rv.body.submission.score, 1);
    assert.deepEqual(rv.body.submission.responses.map((x) => [x.answer, x.correct, x.ok]), [['Ribosome', 'Mitochondrion', false], ['Nucleus', 'Nucleus', true]]);
  });

  await step('Video type: YouTube and Vimeo links are saved and the item is lecturer-graded in assignments', async () => {
    const v = await teacher('POST', '/api/contents', { type: 'videoplayer', title: 'Welcome', data: { source: 'vimeo', link: 'https://vimeo.com/76979871/abcdef1234', title: 'Welcome' } });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    const info = await teacher('POST', '/api/grading-info', { type: 'videoplayer', data: v.body.data || {} });
    assert.equal(info.body.mode, 'manual'); assert.equal(info.body.max, 10);
  });

  await step('ReachQuizzes: second registration with a course menu item, off by default, for everyone', async () => {
    const q = form({ app: 'quizzes', openid_configuration: `${mock.base}/api/lti/security/openid-configuration`, registration_token: mock.state.regToken });
    const r = await fetch(`${TOOL}/lti/register`, { method: 'POST', body: q });
    assert.equal(r.status, 200); assert.match(await r.text(), /ReachQuizzes is registered/);
    const p = mock.state.quizRegistration.payload;
    assert.equal(p.client_name, 'ReachQuizzes');
    const msgs = p['https://purl.imsglobal.org/spec/lti-tool-configuration'].messages;
    assert.deepEqual(msgs.map((m) => m.placements[0]), ['course_navigation']);
    assert.equal(msgs[0].label, 'Quizzes+');
    assert.equal(msgs[0]['https://canvas.instructure.com/lti/course_navigation/default_enabled'], false, 'teachers switch it on per course');
    assert.equal(msgs[0]['https://canvas.instructure.com/lti/display_type'], 'default');
    assert.equal(msgs[0].roles, undefined, 'students see it too');
    assert.notEqual(mock.state.quizRegistration.client_id, mock.state.registration.client_id);
    const cfg = await (await fetch(`${TOOL}/lti/quizzes-config.json`)).json();
    assert.equal(cfg.extensions[0].settings.placements[0].default, 'disabled');
  });

  await step('ReachQuizzes: teachers need no login and connect to ReachLMS once (OAuth, same person only)', async () => {
    const lt = await launch('qnav:course', 'teacher', { quizzes: true });
    const t = api(bootToken(lt.html));
    assert.equal((await t('GET', '/api/me')).body.user?.email, 'taylor@school.test', 'linked account reused');
    const lg = await launch('qnav:course', 'guest', { quizzes: true });
    const g = api(bootToken(lg.html));
    const gm = (await g('GET', '/api/me')).body;
    assert.equal(gm.user?.email, 'gale@school.test', 'a teacher never seen before gets an account automatically');
    assert.equal((await t('GET', '/api/canvas/status')).body.connected, false);
    // Authorizing as somebody else is refused.
    const bad = await t('POST', '/api/canvas/authorize');
    const r1 = await fetch(`${bad.body.url}&as=guest`, { redirect: 'manual' });
    const cb1 = await fetch(r1.headers.get('location'));
    assert.equal(cb1.status, 400); assert.match(await cb1.text(), /different person/);
    // The right person connects.
    const ok = await t('POST', '/api/canvas/authorize');
    assert.match(ok.body.url, /\/login\/oauth2\/auth\?client_id=mock-api-key/);
    const r2 = await fetch(`${ok.body.url}&as=teacher`, { redirect: 'manual' });
    const cb2 = await fetch(r2.headers.get('location'));
    assert.equal(cb2.status, 200, await cb2.text());
    assert.equal((await t('GET', '/api/canvas/status')).body.connected, true);
    // Students can't connect.
    const ls = await launch('qnav:course', 'student', { quizzes: true });
    assert.equal((await api(bootToken(ls.html))('POST', '/api/canvas/authorize')).status, 403);
  });

  await step('ReachQuizzes: a quiz is a real ReachLMS assignment (group, grading type, dates, Assign To, publish); marked on the server', async () => {
    const lt = await launch('qnav:course', 'teacher', { quizzes: true });
    const t = api(bootToken(lt.html));
    const list0 = (await t('GET', '/api/quizzes')).body;
    assert.equal(list0.connected, true); assert.equal(list0.weighted, true);
    assert.deepEqual(list0.groups.map((x) => [x.name, x.weight]), [['Assignments', 40], ['Quizzes', 60]]);
    const before = mock.state.assignments.length;
    const made = await t('POST', '/api/quizzes', { title: 'Week 1 quiz', groupId: '12' });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const a = mock.state.assignments[before];
    assert.equal(a.rest.published, false, 'new quizzes start unpublished, like ReachLMS');
    assert.equal(a.rest.assignment_group_id, 12);
    assert.match(a.item.url, new RegExp(`quiz=${made.body.id}$`));
    const ed = (await t('GET', `/api/quizzes/${made.body.id}`)).body;
    assert.equal(ed.sections.length, 2); assert.ok(ed.students.length >= 1);
    const questions = [
      { id: 'q1', kind: 'mc', points: 2, data: { text: '<p>Powerhouse?</p>', options: [{ text: 'Mitochondrion', correct: true }, { text: 'Nucleus', correct: false }] } },
      { id: 'q2', kind: 'ma', points: 2, partial: true, data: { text: '<p>Plant parts?</p>', options: [{ text: 'Cell wall', correct: true }, { text: 'Chloroplast', correct: true }, { text: 'Centriole', correct: false }] } },
      { id: 'q3', kind: 'numeric', points: 1, data: { text: '<p>Chromosomes?</p>', answer: 46, margin: 0.5 } },
      { id: 'q4', kind: 'order', points: 2, partial: true, data: { items: [{ text: 'a' }, { text: 'b' }] } },
      { id: 'q5', kind: 'essay', points: 3, data: { task: '<p>Explain osmosis.</p>' } },
    ];
    const due = new Date(Date.now() + 7 * 864e5).toISOString();
    const put = await t('PUT', `/api/quizzes/${made.body.id}`, {
      title: 'Week 1 quiz', groupId: '12', gradingType: 'percent', published: true,
      data: { description: '<p>Good luck</p>', questions, grading: { attempts: 1, keep: 'best', showFeedback: true, showScore: true, showAnswers: false }, settings: {} },
      assign: [{ id: 'a', targets: ['everyone'], due }, { id: 'b', targets: ['section:21'], due: new Date(Date.now() + 9 * 864e5).toISOString() }],
    });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.equal(a.lineItem.scoreMaximum, 10, 'points = sum of question points');
    assert.equal(a.rest.grading_type, 'percent'); assert.equal(a.rest.published, true); assert.equal(a.rest.due_at, due);
    assert.equal(a.rest.description, '<p>Good luck</p>');
    const ov = mock.state.overrides.filter((o) => o.assignment_id === a.id && !o.deleted);
    assert.equal(ov.length, 1); assert.equal(ov[0].course_section_id, 21);
    // Students: listed under its assignment group, opened on the assignment page in ReachLMS.
    const ls = await launch('qnav:course', 'student', { quizzes: true });
    const sl = (await api(bootToken(ls.html))('GET', '/api/quizzes')).body.quizzes;
    const mine = sl.find((x) => x.id === made.body.id);
    assert.equal(mine.group, 'Quizzes'); assert.equal(mine.points, 10); assert.equal(mine.questions, 5);
    assert.equal(mine.url, `${mock.base}/courses/1/assignments/${a.id}`);
    // Taking it from the assignment: no answer keys in the page.
    const la = await launch(`rl:assign-${a.id}`, 'student', { quizzes: true });
    const b = boot(la.html);
    assert.equal(b.content.type, 'rqquiz'); assert.equal(b.graded, true);
    const qs = b.content.data.questions;
    assert.ok(qs.filter((x) => ['mc', 'ma'].includes(x.kind)).every((x) => x.data.options.every((o) => !('correct' in o))), 'choice answer keys withheld');
    assert.equal(qs.find((x) => x.kind === 'numeric').data.answer, undefined, 'numeric answer withheld');
    const s = api(b.token);
    const sub = await s('POST', '/api/score', { score: 999, snapshot: '<div class="rs">quiz</div>', responses: [
      { key: 'q1', picked: [0] }, { key: 'q2', picked: [0, 2] }, { key: 'q3', value: '46.3' },
      { key: 'q4', raw: 3, rawMax: 5 }, { key: 'q5', answer: 'Water moves across a membrane.' }] });
    assert.equal(sub.status, 200, JSON.stringify(sub.body));
    assert.equal(sub.body.score, 4.2, '2 + 0 (one right, one wrong) + 1 + 1.2 (3/5 of 2) + essay pending');
    const sc = a.scores['user-student-1'];
    assert.equal(sc.scoreGiven, 4.2); assert.equal(sc.scoreMaximum, 10);
    assert.equal(sc.gradingProgress, 'PendingManual', 'essay still needs grading in SpeedGrader');
    // SpeedGrader shows each question with the points earned.
    const sg = await launch(`rl:sg-${a.id}.user-student-1`, 'teacher');
    const tg = api(bootToken(sg.html));
    const rv = (await tg('GET', `/api/submissions/${(await tg('GET', '/api/review')).body.id}`)).body.submission;
    assert.deepEqual(rv.responses.map((x) => x.note), ['2 / 2 pts', '0 / 2 pts', '1 / 1 pts', '1.2 / 2 pts', '3 pts — grade in SpeedGrader']);
    assert.equal(rv.responses[0].correct, 'Mitochondrion');
    // Students don't get the correct answers when the quiz doesn't show them.
    const own = (await s('GET', `/api/submissions/${sub.body.id}`)).body.submission;
    assert.ok(own.responses.every((x) => x.correct === ''));
    // Unpublish and delete go to ReachLMS too.
    assert.equal((await t('POST', `/api/quizzes/${made.body.id}/publish`, { published: false })).body.published, false);
    assert.equal(a.rest.published, false);
    assert.equal((await t('DELETE', `/api/quizzes/${made.body.id}`)).status, 200);
    assert.equal(a.deleted, true);
  });

  await step('admin view: ADMIN_EMAILS user is an admin; teachers are blocked from admin APIs', async () => {
    const me = await teacher('GET', '/api/me');
    assert.equal(me.body.user.role, 'admin');
    assert.equal((await other('GET', '/api/admin/stats')).status, 403);
    const stats = await teacher('GET', '/api/admin/stats');
    assert.equal(stats.status, 200);
    assert.equal(stats.body.users, 3, 'includes the teacher whose account Quizzes+ created');
    assert.ok(stats.body.contents >= 3);
    assert.equal(stats.body.gradesSent, 5, 'four auto-marked attempts (one from ReachQuizzes) and one lecturer-graded submission were sent');
    const users = await teacher('GET', '/api/admin/users');
    const row = users.body.find((u) => u.email === 'taylor@school.test');
    assert.ok(row.contents >= 3); assert.equal(row.linked, 1);
    const detail = await teacher('GET', `/api/admin/users/${row.id}`);
    assert.equal(detail.body.byType, undefined, 'no content-by-type breakdown');
    assert.equal(detail.body.storage.images + detail.body.storage.video, detail.body.storage.total);
    assert.equal(detail.body.storage.video, 300 * 1024, 'exact bytes on disk');
    assert.equal(row.storage.total, detail.body.storage.total);
    assert.equal(stats.body.storage.total, detail.body.storage.total);
    assert.equal(detail.body.contents, undefined, 'admins see usage, not other users\' content');
    assert.equal((await teacher('GET', `/api/admin/contents/${quizId}`)).status, 404, 'no admin content viewer');
  });

  await step('admin can suspend, reactivate, promote and delete accounts (but not their own)', async () => {
    assert.equal((await teacher('PATCH', `/api/admin/users/${(await teacher('GET', '/api/me')).body.user.id}`, { status: 'suspended' })).status, 400, 'cannot suspend yourself');
    assert.equal((await teacher('PATCH', `/api/admin/users/${otherId}`, { status: 'suspended' })).body.status, 'suspended');
    assert.equal((await other('GET', '/api/contents')).status, 401, 'suspended user is signed out');
    const login = await fetch(`${TOOL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'other@school.test', password: 'another password' }) });
    assert.equal(login.status, 403, 'suspended user cannot sign in');
    await teacher('PATCH', `/api/admin/users/${otherId}`, { status: 'active' });
    const login2 = await fetch(`${TOOL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'other@school.test', password: 'another password' }) });
    assert.equal(login2.status, 200, 'reactivated user can sign in');
    const o2 = api((await login2.json()).token);
    const made = await o2('POST', '/api/contents', { type: 'accordion', title: 'FAQ', data: { panels: [{ title: 'Q', body: 'A' }] } });
    const stats0 = (await teacher('GET', '/api/admin/stats')).body;
    assert.equal((await teacher('PATCH', `/api/admin/users/${otherId}`, { role: 'admin' })).body.role, 'admin');
    assert.equal((await o2('GET', '/api/admin/stats')).status, 200, 'promoted user sees admin APIs');
    await teacher('PATCH', `/api/admin/users/${otherId}`, { role: 'teacher' });
    assert.equal((await teacher('DELETE', `/api/admin/users/${otherId}`)).status, 200);
    assert.equal((await teacher('GET', '/api/admin/stats')).body.contents, stats0.contents - 1, 'their content is deleted too');
    assert.equal((await teacher('GET', '/api/admin/stats')).body.users, 2);
  });

  await step('sign in from a fresh ReachLMS identity links the existing account', async () => {
    const l = await launch('dl:link_selection', 'student'); // a different LTI identity
    const t = api(bootToken(l.html));
    assert.equal((await t('GET', '/api/me')).body.user, null);
    const r = await t('POST', '/api/auth/login', { email: 'taylor@school.test', password: 'correct horse battery' });
    assert.equal(r.status, 200);
    assert.equal((await t('GET', '/api/contents')).body.length, 6, 'quiz, hotspots, blanks, essay, silent quiz and video');
  });
  const jpost = (p, body) => fetch(TOOL + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const loginAs = async (email, password) => { const r = await jpost('/api/auth/login', { email, password }); return { status: r.status, body: await r.json() }; };

  await step('admin reset link: one-time, newest only, signs the user out everywhere', async () => {
    const su = await (await jpost('/api/auth/signup', { name: 'Reset Me', email: 'resetme@school.test', password: 'original password' })).json();
    const victim = api(su.token);
    assert.equal((await victim('POST', `/api/admin/users/${su.user.id}/reset-link`)).status, 403, 'teachers cannot create reset links');
    const first = await teacher('POST', `/api/admin/users/${su.user.id}/reset-link`);
    const second = await teacher('POST', `/api/admin/users/${su.user.id}/reset-link`);
    assert.match(second.body.url, /^http:\/\/localhost:3101\/reset\?token=[\w-]{40,}$/);
    const page = await (await fetch(second.body.url)).text();
    assert.match(page, /Choose a new password/);
    const tok = (u) => new URL(u).searchParams.get('token');
    assert.equal((await jpost('/api/auth/reset', { token: tok(first.body.url), password: 'hijacked pass 1' })).status, 400, 'older link no longer works');
    assert.equal((await jpost('/api/auth/reset', { token: tok(second.body.url), password: 'short' })).status, 400, 'password rules apply');
    const ok = await jpost('/api/auth/reset', { token: tok(second.body.url), password: 'brand new pass' });
    assert.equal(ok.status, 200);
    assert.equal((await jpost('/api/auth/reset', { token: tok(second.body.url), password: 'another one 1' })).status, 400, 'link works only once');
    assert.equal((await victim('GET', '/api/contents')).status, 401, 'existing sessions are signed out');
    assert.equal((await loginAs('resetme@school.test', 'original password')).status, 401);
    assert.equal((await loginAs('resetme@school.test', 'brand new pass')).status, 200);
  });

  await step('change password: current password required outside ReachLMS', async () => {
    const l = await loginAs('taylor@school.test', 'correct horse battery');
    const t = api(l.body.token);
    assert.equal((await t('GET', '/api/me')).body.passwordWithoutCurrent, false);
    assert.equal((await t('POST', '/api/auth/password', { password: 'new password 2' })).status, 401);
    assert.equal((await t('POST', '/api/auth/password', { current: 'wrong', password: 'new password 2' })).status, 401);
    assert.equal((await t('POST', '/api/auth/password', { current: 'correct horse battery', password: 'new password 2' })).status, 200);
    assert.equal((await loginAs('taylor@school.test', 'correct horse battery')).status, 401);
    assert.equal((await t('GET', '/api/contents')).status, 200, 'the session that changed it stays signed in');
  });

  await step('forgot password from ReachLMS: a previously linked login can set a new password', async () => {
    // The password change above stopped ReachLMS logins signing in automatically.
    const l = await launch('dl:editor_button', 'teacher');
    const t = api(bootToken(l.html));
    const me = (await t('GET', '/api/me')).body;
    assert.equal(me.user, null);
    assert.match(me.recoverable.emailHint, /^t\*+r@school\.test$/);
    assert.equal(me.recoverable.name, 'Taylor Teacher');
    assert.equal((await t('POST', '/api/auth/recover', { password: 'short' })).status, 400);
    const r = await t('POST', '/api/auth/recover', { password: 'recovered pass 3' });
    assert.equal(r.status, 200); assert.equal(r.body.user.email, 'taylor@school.test');
    const me2 = (await t('GET', '/api/me')).body;
    assert.equal(me2.user.email, 'taylor@school.test');
    assert.equal(me2.passwordWithoutCurrent, true, 'ReachLMS vouches for this session');
    assert.equal((await t('POST', '/api/auth/recover', { password: 'again again 4' })).status, 400, 'not available once signed in');
    assert.equal((await t('POST', '/api/auth/password', { password: 'set via lms 5' })).status, 200, 'no current password needed');
    assert.equal((await loginAs('taylor@school.test', 'set via lms 5')).status, 200);
    const next = await launch('dl:editor_button', 'teacher');
    assert.equal((await api(bootToken(next.html))('GET', '/api/me')).body.user?.email, 'taylor@school.test', 'next launch signs in automatically again');
  });

  await step('a ReachLMS login never linked to an account cannot use recovery', async () => {
    const l = await launch('dl:editor_button', 'admin');
    const t = api(bootToken(l.html));
    const me = (await t('GET', '/api/me')).body;
    assert.equal(me.user, null);
    assert.equal(me.recoverable, null);
    assert.equal((await t('POST', '/api/auth/recover', { password: 'take over 123' })).status, 400);
  });
} catch {
  // reported below
} finally {
  console.log(results.join('\n'));
  console.log(`\n${passed}/${results.length} steps passed`);
  toolServer.close(); await mock.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exitCode = results.some((r) => r.includes('✗')) ? 1 : 0;
}

function bootTokenOf(apiFn) { return apiFn.__token; }
