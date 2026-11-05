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
  DATA_DIR: tmp, PUBLIC_URL: `http://localhost:${TOOL_PORT}`, ALLOW_INSECURE_PLATFORMS: 'true', PORT: String(TOOL_PORT),
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
  try { await fn(); passed++; results.push(`  ✓ ${name}`); } catch (e) { results.push(`  ✗ ${name}\n      ${e.stack.split('\n').slice(0, 3).join('\n      ')}`); throw e; }
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
async function launch(hint, as = 'teacher', { tamper = false, replay = false } = {}) {
  const st = await (await fetch(`${mock.base}/state`)).json();
  assert.ok(st.registered, 'tool must be registered first');
  const clientId = mock.state.registration.client_id;
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
    assert.deepEqual(placements, ['editor_button:LtiDeepLinkingRequest', 'assignment_selection:LtiDeepLinkingRequest', 'link_selection:LtiDeepLinkingRequest', 'course_navigation:LtiResourceLinkRequest']);
  });

  await step('rejects launches from an unregistered platform', async () => {
    const r = await fetch(`${TOOL}/lti/login`, { method: 'POST', redirect: 'manual', body: form({ iss: 'https://evil.example', login_hint: 'x', client_id: '1' }) });
    assert.equal(r.status, 400);
  });

  await step('Dynamic Registration installs the tool into the platform', async () => {
    const q = form({ openid_configuration: `${mock.base}/api/lti/security/openid-configuration`, registration_token: mock.state.regToken });
    const page = await (await fetch(`${TOOL}/lti/register?${q}`)).text();
    assert.match(page, /Install Reach Studio/);
    const r = await fetch(`${TOOL}/lti/register`, { method: 'POST', body: q });
    const html = await r.text();
    assert.equal(r.status, 200, html);
    assert.match(html, /is registered/);
    const p = mock.state.registration.payload;
    const msgs = p['https://purl.imsglobal.org/spec/lti-tool-configuration'].messages;
    assert.deepEqual(msgs.map((m) => m.placements[0]), ['editor_button', 'assignment_selection', 'link_selection', 'course_navigation']);
    assert.equal(p.token_endpoint_auth_method, 'private_key_jwt');
    assert.deepEqual(p.redirect_uris, [`${TOOL}/lti/launch`]);
  });

  let teacher; let quizId; let hotspotId;
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
    const hs = await teacher('POST', '/api/contents', { type: 'hotspots', title: 'Cell diagram', data: { image: '/media/x.png', hotspots: [{ x: 10, y: 20, title: 'Nucleus', body: 'Holds DNA' }] } });
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
    assert.ok(item.iframe.width > 0 && item.iframe.height > 0, 'RCE embed has iframe size');
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
    assert.ok(!a.item.iframe, 'assignments launch full-frame');
  });

  await step('student assignment launch shows the player and sends the grade via AGS', async () => {
    const l = await launch('rl:assign-0', 'student');
    assert.equal(l.status, 200, l.html);
    const b = boot(l.html);
    assert.equal(b.content.type, 'quiz'); assert.equal(b.graded, true); assert.equal(b.canEdit, false);
    const s = api(b.token);
    const forged = await s('POST', '/api/score', { score: 99 });
    assert.equal(forged.body.score, 3, 'score is clamped to the maximum');
    const r = await s('POST', '/api/score', { score: 2 });
    assert.equal(r.body.passback, 'sent');
    const score = mock.state.assignments[0].scores['user-student-1'];
    assert.equal(score.scoreGiven, 2); assert.equal(score.scoreMaximum, 3);
    assert.equal(score.activityProgress, 'Completed'); assert.equal(score.gradingProgress, 'FullyGraded');
    const denied = await s('GET', '/api/contents');
    assert.equal(denied.status, 401, 'students have no library access');
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
    const other = api((await r.json()).token);
    assert.equal((await other('GET', `/api/contents/${quizId}`)).status, 404);
    assert.equal((await other('GET', '/api/contents')).body.length, 0);
    assert.equal((await other('POST', '/api/embed', { contentId: quizId })).status, 400, 'no deep-link session');
    const bad = await fetch(`${TOOL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'taylor@school.test', password: 'wrong' }) });
    assert.equal(bad.status, 401);
  });

  await step('sign in from a fresh ReachLMS identity links the existing account', async () => {
    const l = await launch('dl:link_selection', 'student'); // a different LTI identity
    const t = api(bootToken(l.html));
    assert.equal((await t('GET', '/api/me')).body.user, null);
    const r = await t('POST', '/api/auth/login', { email: 'taylor@school.test', password: 'correct horse battery' });
    assert.equal(r.status, 200);
    assert.equal((await t('GET', '/api/contents')).body.length, 2);
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
