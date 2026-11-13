// A small pretend ReachLMS / Canvas acting as an LTI 1.3 platform, for testing and demos.
// Implements: Dynamic Registration, OIDC auth (form_post), signed id_tokens, deep-link return,
// client_credentials token endpoint and AGS score endpoint, plus a course page to click through.
// Used by DEMO_MODE (mounted at /demo on the tool itself) and by test/mock-canvas.js.
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT, jwtVerify, createRemoteJWKSet, decodeJwt } from 'jose';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOGO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reachlms-logo.jpg');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const USERS = {
  teacher: { canvasId: '101', sub: 'user-teacher-1', name: 'Taylor Teacher', given_name: 'Taylor', family_name: 'Teacher', email: 'taylor@school.test', roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'] },
  guest: { canvasId: '102', sub: 'user-guest-1', name: 'Gale Guest', given_name: 'Gale', family_name: 'Guest', email: 'gale@school.test', roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'] },
  admin: { canvasId: '103', sub: 'user-admin-1', name: 'Alex Admin', given_name: 'Alex', family_name: 'Admin', email: 'alex@school.test', roles: ['http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator', 'http://purl.imsglobal.org/vocab/lis/v2/system/person#User'] },
  student2: { canvasId: '202', sub: 'user-student-2', name: 'Robin Student', given_name: 'Robin', family_name: 'Student', email: 'robin@school.test', roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'] },
  student: { canvasId: '201', sub: 'user-student-1', name: 'Sam Student', given_name: 'Sam', family_name: 'Student', email: 'sam@school.test', roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'] },
};

/**
 * base: the public URL this platform is served at (e.g. https://studio.example.com/demo)
 * toolUrl: the public URL of ReachStudio
 * resolve: maps a public URL to one this server can call directly (server-to-server)
 */
export async function createMockPlatform({ base, toolUrl, resolve = (u) => u }) {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const kid = 'mock-canvas-key';
  const pubJwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  const state = {
    regToken: crypto.randomBytes(12).toString('hex'),
    registration: null, // ReachStudio { client_id, payload }
    quizRegistration: null, // ReachQuizzes (second registration from the same tool)
    deploymentId: 'deployment-1',
    page: [], // embedded content items in the course page (RCE)
    assignments: [], // { id, title, lineItem, item, scores: {}, submissions: { [userId]: [...] } }
    issuedTokens: new Set(),
    log: [],
  };
  const log = (m) => { state.log.push(m); };
  const regByClient = (id) => [state.registration, state.quizRegistration].find((r) => r && r.client_id === String(id));

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ type: ['application/json', 'application/vnd.ims.lis.v1.score+json'] }));
  app.use((req, res, next) => { if (req.query.as && USERS[req.query.as] && req.method === 'GET' && !req.path.startsWith('/login')) state.lastRole = req.query.as; next(); });

  app.get('/logo.jpg', (req, res) => res.sendFile(LOGO));

  app.get('/api/lti/security/jwks', (req, res) => res.json({ keys: [pubJwk] }));

  app.get('/api/lti/security/openid-configuration', (req, res) => {
    if (req.get('authorization') !== `Bearer ${state.regToken}`) return res.status(401).json({ error: 'bad registration token' });
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/api/lti/authorize_redirect`,
      registration_endpoint: `${base}/api/lti/registrations`,
      jwks_uri: `${base}/api/lti/security/jwks`,
      token_endpoint: `${base}/login/oauth2/token`,
      token_endpoint_auth_methods_supported: ['private_key_jwt'],
      scopes_supported: ['https://purl.imsglobal.org/spec/lti-ags/scope/lineitem', 'https://purl.imsglobal.org/spec/lti-ags/scope/score'],
      'https://purl.imsglobal.org/spec/lti-platform-configuration': {
        product_family_code: 'canvas', version: 'mock',
        'https://canvas.instructure.com/lti/account_name': 'Mock ReachLMS',
      },
    });
  });

  app.post('/api/lti/registrations', (req, res) => {
    if (req.get('authorization') !== `Bearer ${state.regToken}`) return res.status(401).json({ error: 'bad registration token' });
    const p = req.body;
    for (const k of ['initiate_login_uri', 'redirect_uris', 'jwks_uri', 'https://purl.imsglobal.org/spec/lti-tool-configuration']) {
      if (!p[k]) return res.status(422).json({ error: `missing ${k}` });
    }
    const quizzes = p['https://purl.imsglobal.org/spec/lti-tool-configuration']['https://canvas.instructure.com/lti/tool_id'] === 'reach-quizzes';
    const reg = { client_id: quizzes ? '10000000000043' : '10000000000042', payload: p };
    if (quizzes) state.quizRegistration = reg; else state.registration = reg;
    log(`registered ${quizzes ? 'ReachQuizzes' : 'ReachStudio'}`);
    res.json({ ...p, client_id: reg.client_id, 'https://purl.imsglobal.org/spec/lti-tool-configuration': { ...p['https://purl.imsglobal.org/spec/lti-tool-configuration'], deployment_id: state.deploymentId } });
  });

  // OIDC authorization: the tool redirects the browser here, we answer with an auto-posting form.
  app.get('/api/lti/authorize_redirect', async (req, res) => {
    const q = req.query;
    const reg = regByClient(q.client_id);
    if (!reg) return res.status(400).send('unknown client_id');
    if (!reg.payload.redirect_uris.includes(q.redirect_uri)) return res.status(400).send('redirect_uri not registered');
    const user = USERS[q.login_hint];
    if (!user) return res.status(400).send('bad login_hint');
    const [kind, arg] = String(q.lti_message_hint || '').split(':');
    const claims = {
      nonce: q.nonce,
      name: user.name, given_name: user.given_name, family_name: user.family_name, email: user.email,
      'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id': state.deploymentId,
      'https://purl.imsglobal.org/spec/lti/claim/roles': user.roles,
      'https://purl.imsglobal.org/spec/lti/claim/context': { id: 'course-1', title: 'Biology 101' },
    };
    if (kind === 'dl') {
      claims['https://purl.imsglobal.org/spec/lti/claim/message_type'] = 'LtiDeepLinkingRequest';
      claims['https://www.instructure.com/placement'] = arg;
      claims['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'] = `${toolUrl}/lti/launch?placement=${arg}`;
      claims['https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'] = {
        deep_link_return_url: `${base}/deep_link_return?placement=${arg}`,
        accept_types: ['ltiResourceLink'], accept_presentation_document_targets: ['iframe', 'window'], accept_multiple: false, data: `opaque-${arg}`,
      };
    } else if (kind === 'rl') {
      const where = arg.slice(0, arg.indexOf('-')); const idx = arg.slice(arg.indexOf('-') + 1);
      if (where === 'sg') { // SpeedGrader: launch the student's latest submission URL as the lecturer
        const ai = idx.slice(0, idx.indexOf('.')); const uid = idx.slice(idx.indexOf('.') + 1);
        const sub = state.assignments[Number(ai)]?.submissions?.[uid]?.at(-1);
        if (!sub?.url) return res.status(404).send('no submission');
        claims['https://purl.imsglobal.org/spec/lti/claim/message_type'] = 'LtiResourceLinkRequest';
        claims['https://purl.imsglobal.org/spec/lti/claim/resource_link'] = { id: `rl-assign-${ai}` };
        claims['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'] = sub.url;
        claims['https://purl.imsglobal.org/spec/lti/claim/custom'] = state.assignments[Number(ai)].item.custom || {};
        claims['https://www.instructure.com/placement'] = 'assignment_selection';
      } else {
      const entry = where === 'page' ? state.page[Number(idx)] : state.assignments[Number(idx)];
      if (!entry) return res.status(404).send('no such link');
      const item = where === 'page' ? entry : entry.item;
      claims['https://purl.imsglobal.org/spec/lti/claim/message_type'] = 'LtiResourceLinkRequest';
      claims['https://purl.imsglobal.org/spec/lti/claim/resource_link'] = { id: `rl-${where}-${idx}` };
      claims['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'] = item.url;
      claims['https://purl.imsglobal.org/spec/lti/claim/custom'] = item.custom || {};
      claims['https://www.instructure.com/placement'] = where === 'page' ? 'editor_button' : 'assignment_selection';
      if (where === 'assign') {
        claims['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'] = {
          scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/lineitem', 'https://purl.imsglobal.org/spec/lti-ags/scope/score'],
          lineitems: `${base}/api/lti/courses/1/line_items`,
          lineitem: `${base}/api/lti/courses/1/line_items/${idx}`,
        };
      }
      }
    } else if (kind === 'qnav') { // ReachQuizzes course menu item (everyone in the course)
      claims['https://purl.imsglobal.org/spec/lti/claim/message_type'] = 'LtiResourceLinkRequest';
      claims['https://purl.imsglobal.org/spec/lti/claim/resource_link'] = { id: 'rl-qnav' };
      claims['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'] = `${toolUrl}/lti/launch?app=quizzes&placement=course_navigation`;
      claims['https://www.instructure.com/placement'] = 'course_navigation';
      claims['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'] = {
        scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/lineitem', 'https://purl.imsglobal.org/spec/lti-ags/scope/score', 'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly'],
        lineitems: `${base}/api/lti/courses/1/line_items`,
      };
    } else if (kind === 'nav') {
      claims['https://purl.imsglobal.org/spec/lti/claim/message_type'] = 'LtiResourceLinkRequest';
      claims['https://purl.imsglobal.org/spec/lti/claim/resource_link'] = { id: 'rl-nav' };
      claims['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'] = `${toolUrl}/lti/launch?placement=course_navigation`;
      claims['https://www.instructure.com/placement'] = 'course_navigation';
    } else return res.status(400).send('bad lti_message_hint');
    // Like Canvas with the variables ReachQuizzes asks for ($Canvas.course.id, $Canvas.user.id, $Canvas.api.baseUrl).
    const CUSTOM = 'https://purl.imsglobal.org/spec/lti/claim/custom';
    claims[CUSTOM] = { ...(claims[CUSTOM] || {}), canvas_course_id: '1', canvas_user_id: user.canvasId, canvas_api_baseurl: base };
    const idToken = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .setIssuer(base).setAudience(reg.client_id).setSubject(user.sub).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    log(`launch ${kind}:${arg} as ${q.login_hint}`);
    res.send(`<!doctype html><form id="f" method="post" action="${esc(q.redirect_uri)}">
      <input type="hidden" name="id_token" value="${esc(idToken)}"><input type="hidden" name="state" value="${esc(q.state)}"></form>
      <script>document.getElementById('f').submit()</script>`);
  });

  // Deep linking return: verify the tool's signed response, then store the content item.
  app.post('/deep_link_return', async (req, res) => {
    try {
      const reg = state.registration;
      const jwks = createRemoteJWKSet(new URL(resolve(reg.payload.jwks_uri)));
      const { payload } = await jwtVerify(req.body.JWT, jwks, { issuer: reg.client_id, audience: base });
      if (payload['https://purl.imsglobal.org/spec/lti/claim/message_type'] !== 'LtiDeepLinkingResponse') throw new Error('wrong message type');
      if (payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'] !== state.deploymentId) throw new Error('wrong deployment');
      const items = payload['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'] || [];
      const placement = req.query.placement;
      for (const item of items) {
        if (placement === 'assignment_selection' || placement === 'submission_type_selection') {
          state.assignments.push({ id: state.assignments.length, title: item.lineItem?.label || item.title, lineItem: item.lineItem || null, item, scores: {}, submissions: {} });
        } else state.page.push(item);
      }
      log(`deep link return (${placement}): ${items.map((i) => i.title).join(', ')} data=${payload['https://purl.imsglobal.org/spec/lti-dl/claim/data']}`);
      res.send('<!doctype html><p style="font-family:sans-serif">Content added. Closing…</p><script>parent.postMessage({subject:"mock.dl_done"},"*")</script>');
    } catch (e) {
      log(`deep link error: ${e.message}`);
      res.status(400).send(`Deep link rejected: ${esc(e.message)}`);
    }
  });

  // OAuth2 client_credentials with private_key_jwt.
  // ---- Canvas REST API with OAuth2 (API Developer Key) — used by ReachQuizzes ----
  state.apiCodes = new Map(); state.apiTokens = new Map(); state.refresh = new Map();
  state.groups = [{ id: 11, name: 'Assignments', group_weight: 40, position: 1 }, { id: 12, name: 'Quizzes', group_weight: 60, position: 2 }];
  state.sections = [{ id: 21, name: 'Section A' }, { id: 22, name: 'Section B' }];
  state.overrides = [];
  const API_KEY = { id: 'mock-api-key', secret: 'mock-api-secret' };
  // Authorize screen: approves straight away as the user viewing the course (?as=… for tests).
  app.get('/login/oauth2/auth', (req, res) => {
    if (req.query.client_id !== API_KEY.id) return res.status(400).send('unknown API key');
    const who = USERS[req.query.as] ? req.query.as : (state.lastRole || 'teacher');
    const code = crypto.randomBytes(8).toString('hex');
    state.apiCodes.set(code, who);
    const u = new URL(req.query.redirect_uri); u.searchParams.set('code', code); u.searchParams.set('state', req.query.state);
    log(`API authorize as ${who}`);
    res.redirect(u.toString());
  });
  const apiUser = (req) => USERS[state.apiTokens.get((req.get('authorization') || '').replace('Bearer ', ''))];
  const teacherOnly = (req, res) => { const u = apiUser(req); if (!u) { res.status(401).json({ errors: [{ message: 'Invalid access token.' }] }); return null; } if (!u.roles.some((r) => /Instructor|Administrator/.test(r))) { res.status(403).json({ errors: [{ message: 'user not authorized to perform that action' }] }); return null; } return u; };
  const restOut = (a) => ({ id: a.id, name: a.title, description: a.rest.description, points_possible: a.lineItem.scoreMaximum, grading_type: a.rest.grading_type, assignment_group_id: a.rest.assignment_group_id,
    published: !!a.rest.published, due_at: a.rest.due_at || null, unlock_at: a.rest.unlock_at || null, lock_at: a.rest.lock_at || null, only_visible_to_overrides: !!a.rest.only_visible_to_overrides, submission_types: ['external_tool'], external_tool_tag_attributes: { url: a.item.url } });
  app.get('/api/v1/courses/1', (req, res) => (apiUser(req) ? res.json({ id: 1, name: 'Biology 101', apply_assignment_group_weights: true }) : res.status(401).end()));
  app.get('/api/v1/courses/1/assignment_groups', (req, res) => (apiUser(req) ? res.json(state.groups) : res.status(401).end()));
  app.get('/api/v1/courses/1/sections', (req, res) => (apiUser(req) ? res.json(state.sections) : res.status(401).end()));
  app.get('/api/v1/courses/1/users', (req, res) => (apiUser(req) ? res.json(Object.values(USERS).filter((u) => u.roles.some((r) => r.endsWith('#Learner'))).map((u) => ({ id: Number(u.canvasId), name: u.name, sortable_name: `${u.family_name}, ${u.given_name}` }))) : res.status(401).end()));
  app.get('/api/v1/courses/1/assignments', (req, res) => (apiUser(req) ? res.json(state.assignments.filter((a) => a.rest && !a.deleted).map(restOut)) : res.status(401).end()));
  const applyRest = (a, b = {}) => {
    if (b.name !== undefined) a.title = b.name;
    if (b.points_possible !== undefined) a.lineItem = { ...a.lineItem, scoreMaximum: Number(b.points_possible) || 0, label: a.title };
    if (b.external_tool_tag_attributes?.url) a.item = { ...a.item, url: b.external_tool_tag_attributes.url };
    for (const k of ['description', 'grading_type', 'assignment_group_id', 'published', 'due_at', 'unlock_at', 'lock_at', 'only_visible_to_overrides']) if (b[k] !== undefined) a.rest[k] = b[k];
  };
  app.post('/api/v1/courses/1/assignments', (req, res) => {
    if (!teacherOnly(req, res)) return;
    const b = req.body.assignment || {};
    if (!(b.submission_types || []).includes('external_tool') || !b.external_tool_tag_attributes?.url) return res.status(400).json({ errors: { submission_types: 'external tool url required' } });
    const a = { id: state.assignments.length, title: b.name || 'Untitled', lineItem: { scoreMaximum: 0, label: b.name }, item: { url: '', custom: {} }, scores: {}, submissions: {}, app: 'quizzes', rest: { published: false, assignment_group_id: state.groups[0].id, grading_type: 'points' } };
    applyRest(a, b); a.lineItem.label = a.title;
    state.assignments.push(a);
    log(`REST created assignment "${a.title}"`);
    res.json(restOut(a));
  });
  const findA = (req, res) => { const a = state.assignments[Number(req.params.id)]; if (!a || a.deleted || !a.rest) { res.status(404).json({ errors: [{ message: 'The specified resource does not exist.' }] }); return null; } return a; };
  app.put('/api/v1/courses/1/assignments/:id', (req, res) => { if (!teacherOnly(req, res)) return; const a = findA(req, res); if (!a) return; applyRest(a, req.body.assignment || {}); res.json(restOut(a)); });
  app.delete('/api/v1/courses/1/assignments/:id', (req, res) => { if (!teacherOnly(req, res)) return; const a = findA(req, res); if (!a) return; a.deleted = true; log(`REST deleted assignment "${a.title}"`); res.json(restOut(a)); });
  app.get('/api/v1/courses/1/assignments/:id/overrides', (req, res) => (apiUser(req) ? res.json(state.overrides.filter((o) => o.assignment_id === Number(req.params.id) && !o.deleted)) : res.status(401).end()));
  app.post('/api/v1/courses/1/assignments/:id/overrides', (req, res) => {
    if (!teacherOnly(req, res)) return; if (!findA(req, res)) return;
    const o = { id: 900 + state.overrides.length, assignment_id: Number(req.params.id), ...(req.body.assignment_override || {}) };
    state.overrides.push(o); res.json(o);
  });
  app.delete('/api/v1/courses/1/assignments/:id/overrides/:oid', (req, res) => {
    if (!teacherOnly(req, res)) return;
    const o = state.overrides.find((x) => x.id === Number(req.params.oid)); if (!o) return res.status(404).end();
    o.deleted = true; res.json(o);
  });

  app.post('/login/oauth2/token', async (req, res) => {
    if (['authorization_code', 'refresh_token'].includes(req.body.grant_type)) {
      if (req.body.client_id !== API_KEY.id || req.body.client_secret !== API_KEY.secret) return res.status(401).json({ error: 'invalid_client' });
      const who = req.body.grant_type === 'authorization_code' ? state.apiCodes.get(req.body.code) : state.refresh.get(req.body.refresh_token);
      if (!who) return res.status(400).json({ error: 'invalid_grant' });
      state.apiCodes.delete(req.body.code);
      const access = crypto.randomBytes(16).toString('hex'); const refresh = crypto.randomBytes(16).toString('hex');
      state.apiTokens.set(access, who); state.refresh.set(refresh, who);
      return res.json({ access_token: access, token_type: 'Bearer', expires_in: 3600, refresh_token: refresh, user: { id: Number(USERS[who].canvasId), name: USERS[who].name } });
    }
    try {
      const reg = regByClient(decodeJwt(req.body.client_assertion).iss);
      if (!reg) throw new Error('unknown client');
      if (req.body.grant_type !== 'client_credentials') throw new Error('bad grant_type');
      const jwks = createRemoteJWKSet(new URL(resolve(reg.payload.jwks_uri)));
      await jwtVerify(req.body.client_assertion, jwks, { issuer: reg.client_id, subject: reg.client_id, audience: `${base}/login/oauth2/token` });
      const token = crypto.randomBytes(16).toString('hex');
      state.issuedTokens.add(token);
      res.json({ access_token: token, token_type: 'Bearer', expires_in: 3600, scope: req.body.scope });
    } catch (e) { res.status(400).json({ error: 'invalid_client', error_description: e.message }); }
  });

  const authed = (req) => state.issuedTokens.has((req.get('authorization') || '').replace('Bearer ', ''));
  const lineItemOut = (a) => ({ id: `${base}/api/lti/courses/1/line_items/${a.id}`, label: a.title, scoreMaximum: a.lineItem?.scoreMaximum, resourceId: a.lineItem?.resourceId, tag: a.lineItem?.tag, startDateTime: a.start || undefined, endDateTime: a.end || undefined });
  // Like Canvas: a line item created by the tool with the submission_type extension becomes an
  // External Tool assignment that launches the given URL.
  app.post('/api/lti/courses/1/line_items', express.json({ type: () => true }), (req, res) => {
    if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
    const b = req.body || {};
    const ext = b['https://canvas.instructure.com/lti/submission_type'] || {};
    if (!b.label || !(b.scoreMaximum >= 0)) return res.status(400).json({ error: 'label and scoreMaximum are required' });
    const a = { id: state.assignments.length, title: b.label, lineItem: { scoreMaximum: b.scoreMaximum, label: b.label, resourceId: b.resourceId, tag: b.tag }, item: { url: ext.external_tool_url, custom: {} }, scores: {}, submissions: {}, app: 'quizzes' };
    state.assignments.push(a);
    log(`tool created assignment "${a.title}" (${b.scoreMaximum} pts)`);
    res.json(lineItemOut(a));
  });
  app.get('/api/lti/courses/1/line_items/:id', (req, res) => {
    if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
    const a = state.assignments[Number(req.params.id)];
    if (!a || a.deleted) return res.status(404).json({ error: 'no line item' });
    res.json(lineItemOut(a));
  });
  app.put('/api/lti/courses/1/line_items/:id', express.json({ type: () => true }), (req, res) => {
    if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
    const a = state.assignments[Number(req.params.id)];
    if (!a || a.deleted) return res.status(404).json({ error: 'no line item' });
    if (req.body.label) a.title = req.body.label;
    if (req.body.scoreMaximum >= 0) a.lineItem = { ...a.lineItem, scoreMaximum: req.body.scoreMaximum, label: a.title };
    res.json(lineItemOut(a));
  });
  app.delete('/api/lti/courses/1/line_items/:id', (req, res) => {
    if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
    const a = state.assignments[Number(req.params.id)];
    if (!a || a.deleted) return res.status(404).json({ error: 'no line item' });
    a.deleted = true; log(`tool deleted assignment "${a.title}"`);
    res.status(204).end();
  });

  app.post('/api/lti/courses/1/line_items/:id/scores', (req, res) => {
    const tok = (req.get('authorization') || '').replace('Bearer ', '');
    if (!state.issuedTokens.has(tok)) return res.status(401).json({ error: 'unauthorized' });
    const a = state.assignments[Number(req.params.id)];
    if (!a || a.deleted) return res.status(404).json({ error: 'no line item' });
    const b = req.body;
    // Like Canvas: PendingManual/FullyGraded without scoreGiven clears the score unless preserve_score.
    const ext = b['https://canvas.instructure.com/lti/submission'] || {};
    const prev = a.scores[b.userId];
    const score = b.scoreGiven !== undefined ? b.scoreGiven : (ext.preserve_score ? prev?.scoreGiven : undefined);
    a.scores[b.userId] = { ...b, scoreGiven: score };
    if (ext.new_submission !== false && ext.submission_type !== 'none' && ['Submitted', 'Completed'].includes(b.activityProgress)) {
      (a.submissions[b.userId] ||= []).push({ type: ext.submission_type, url: ext.submission_data, at: ext.submitted_at, gradingProgress: b.gradingProgress, scoreGiven: b.scoreGiven });
    }
    log(`score ${b.scoreGiven ?? '—'}/${b.scoreMaximum} (${b.gradingProgress}) for ${b.userId} on "${a.title}"`);
    res.json({ resultUrl: `${base}/results/1` });
  });

  app.get('/courses/1/assignments/:id', (req, res) => {
    const a = state.assignments[Number(req.params.id)];
    const role = state.lastRole || 'student';
    const reg = a?.app === 'quizzes' ? state.quizRegistration : state.registration;
    if (!a || a.deleted || !reg) return res.status(404).send('Assignment not found');
    const student = !USERS[role].roles.some((r) => /Instructor|Administrator/.test(r));
    let note = '';
    if (student && a.rest && !a.rest.published) note = 'This assignment is not available yet.';
    else if (student && a.rest?.unlock_at && Date.parse(a.rest.unlock_at) > Date.now()) note = `This assignment is locked until ${new Date(a.rest.unlock_at).toLocaleString()}.`;
    const login = `${toolUrl}/lti/login?${new URLSearchParams({ iss: base, login_hint: role, client_id: reg.client_id, lti_deployment_id: state.deploymentId, target_link_uri: `${toolUrl}/lti/launch`, lti_message_hint: `rl:assign-${a.id}` })}`;
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(a.title)}</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#f5f5f5;color:#2d3b45}
      header{background:#fff;padding:10px 20px;border-bottom:3px solid #278DDF;display:flex;gap:16px;align-items:center}header img{height:40px}
      main{max-width:1100px;margin:20px auto;background:#fff;padding:20px 28px;border-radius:6px} iframe{width:100%;height:760px;border:0}</style></head><body>
      <header><img src="${base}/logo.jpg" alt="ReachLMS"><a href="${base}/?as=${role}">Biology 101</a> › Assignments › ${esc(a.title)}</header>
      <main><h1>${esc(a.title)}</h1>${a.rest?.due_at ? `<p>Due ${esc(new Date(a.rest.due_at).toLocaleString())} · ${a.lineItem.scoreMaximum} pts</p>` : `<p>${a.lineItem.scoreMaximum} pts</p>`}
      ${note ? `<p><strong>${esc(note)}</strong></p>` : `<iframe id="tool" src="${esc(login)}" title="${esc(a.title)}"></iframe>`}</main>
      <script>window.addEventListener('message',function(e){var d=e.data||{};if(d.subject==='lti.frameResize'){document.getElementById('tool').style.height=(Number(d.height)+10)+'px'}})</script></body></html>`);
  });

  app.get('/state', (req, res) => res.json({ registered: !!state.registration, quizzesRegistered: !!state.quizRegistration, page: state.page, assignments: state.assignments, log: state.log }));

  // A simple "course page" UI to click through the whole flow in a browser.
  app.get('/', (req, res) => {
    const role = req.query.as === 'student' ? 'student' : 'teacher';
    const reg = state.registration;
    const qreg = state.quizRegistration;
    const loginUrl = (hint, r = reg) => `${toolUrl}/lti/login?${new URLSearchParams({ iss: base, login_hint: role, client_id: r?.client_id || '', lti_deployment_id: state.deploymentId, target_link_uri: `${toolUrl}/lti/launch`, lti_message_hint: hint })}`;
    const regUrl = `${toolUrl}/lti/register?${new URLSearchParams({ openid_configuration: `${base}/api/lti/security/openid-configuration`, registration_token: state.regToken })}`;
    const qregUrl = `${toolUrl}/lti/register?${new URLSearchParams({ app: 'quizzes', openid_configuration: `${base}/api/lti/security/openid-configuration`, registration_token: state.regToken })}`;
    const navLabel = qreg?.payload['https://purl.imsglobal.org/spec/lti-tool-configuration']?.messages?.[0]?.label || 'Quizzes+';
    const pageEmbeds = state.page.map((item, i) => `<iframe class="embed" title="${esc(item.title)}" src="${esc(loginUrl(`rl:page-${i}`))}" style="width:100%;max-width:${item.iframe?.width || 800}px;height:${item.iframe?.height || 500}px"></iframe>`).join('');
    const names = Object.fromEntries(Object.values(USERS).map((u) => [u.sub, u.name]));
    const assignments = state.assignments.map((a, i) => (a.deleted ? '' : `<li><strong>${esc(a.title)}</strong> (${a.lineItem ? `${a.lineItem.scoreMaximum} pts` : 'ungraded'})${a.app === 'quizzes' ? ' <span class="muted">· created by ReachQuizzes</span>' : ''}
        — <button onclick="openModal('${esc(loginUrl(`rl:assign-${i}`, a.app === 'quizzes' ? qreg : reg))}')">Open</button>
        ${role === 'teacher' ? Object.entries(a.submissions || {}).map(([uid, subs]) => {
          const s = a.scores[uid] || {}; const needs = subs.at(-1)?.gradingProgress === 'PendingManual';
          return `<div class="sg">SpeedGrader · ${esc(names[uid] || uid)}: ${subs.length} submission${subs.length === 1 ? '' : 's'} ·
            ${needs ? '<span class="needs">Needs grading</span>' : `<span class="score">${s.scoreGiven ?? '–'}/${s.scoreMaximum}</span>`}
            <button class="sgbtn" onclick="openModal('${esc(loginUrl(`rl:sg-${i}.${uid}`))}')">Open in SpeedGrader</button></div>`;
        }).join('') : Object.values(a.scores).map((s) => `<span class="score">Gradebook: ${s.scoreGiven ?? 'pending'}/${s.scoreMaximum}</span>`).join('')}</li>`)).join('');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>ReachLMS demo course</title><style>
      body{font-family:system-ui,sans-serif;margin:0;background:#f5f5f5;color:#2d3b45}
      header{background:#fff;color:#193B82;padding:10px 20px;display:flex;gap:16px;align-items:center;border-bottom:3px solid #278DDF}
      header a{color:#193B82} header img{height:40px;display:block} .course{font-weight:700;border-left:1px solid #dde3ec;padding-left:16px}
      button{font:inherit;cursor:pointer} #install,#new-assignment,.navbtn{background:#278DDF;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:600} .demo-note{background:#E6F2FC;color:#134d80;border-radius:8px;padding:10px 14px;font-size:14px} main{max-width:1000px;margin:20px auto;background:#fff;padding:20px 28px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
      .rce{border:1px solid #c7cdd1;border-radius:4px} .rce-bar{border-bottom:1px solid #c7cdd1;padding:6px;display:flex;gap:4px;background:#f5f5f5}
      .rce-bar button{border:1px solid transparent;background:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:14px}
      .rce-bar button:hover{border-color:#c7cdd1;background:#fff} .rce-body{padding:12px;min-height:80px}
      iframe.embed{border:1px solid #ddd;display:block;margin:10px 0} .sg{margin:6px 0 0 18px;font-size:14px} .needs{background:#fff6e0;color:#6b4a0e;padding:2px 8px;border-radius:9px} .sgbtn{margin-left:6px} .score{background:#e3f6ec;color:#0f5f3c;padding:2px 8px;border-radius:9px;margin-left:6px}
      #modal{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;place-items:center;z-index:9}
      #modal .box{background:#fff;width:min(1200px,96vw);height:min(950px,95vh);border-radius:6px;overflow:hidden;display:flex;flex-direction:column}
      #modal .bar{padding:8px 12px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;font-weight:600}
      #modal iframe{flex:1;border:0;width:100%} .muted{color:#6b7780;font-size:14px}</style></head><body>
      <header><img src="${base}/logo.jpg" alt="ReachLMS"><span class="course">Biology 101 <span class="muted">(demo course)</span></span><span style="flex:1"></span>
        Viewing as: <a href="${base}/?as=teacher">${role === 'teacher' ? '<b>Teacher</b>' : 'Teacher'}</a> | <a href="${base}/?as=student">${role === 'student' ? '<b>Student</b>' : 'Student'}</a></header>
      <main>
      ${reg ? `<p class="muted">ReachStudio is installed (client ID ${esc(reg.client_id)}).</p>` : `<p class="demo-note">This is a pretend ReachLMS course for trying ReachStudio. Start by installing it:</p><p><button id="install" onclick="openModal('${esc(regUrl)}')">Install ReachStudio (Dynamic Registration)</button></p>`}
      <h2>Week 1: Cells</h2>
      ${role === 'teacher' && reg ? `<div class="rce"><div class="rce-bar"><button><b>B</b></button><button><i>I</i></button><button>🔗</button>
        <button id="rce-tool" title="ReachStudio" onclick="openModal('${esc(loginUrl('dl:editor_button'))}')"><img src="${toolUrl}/img/icon-64.png" width="16" height="16" alt=""> ReachStudio</button></div>
        <div class="rce-body">Welcome to the cells unit! <span class="muted">(Rich Content Editor — use the ReachStudio button to embed content.)</span></div></div>` : ''}
      <div id="page">${pageEmbeds || '<p class="muted">No embedded content yet.</p>'}</div>
      <h2>Assignments</h2>
      ${role === 'teacher' && reg ? `<p><button id="new-assignment" onclick="openModal('${esc(loginUrl('dl:assignment_selection'))}')">+ Assignment → External Tool → ReachStudio</button>
        <button id="new-assignment-type" class="navbtn" onclick="openModal('${esc(loginUrl('dl:submission_type_selection'))}')">+ Assignment → Submission type: ReachStudio</button></p>` : ''}
      <ul>${assignments || '<li class="muted">None</li>'}</ul>
      ${role === 'teacher' && reg ? `<p><button class="navbtn" onclick="openModal('${esc(loginUrl('nav:course'))}')">Course navigation: ReachStudio</button></p>` : ''}
      <h2>Course menu: ${esc(navLabel)}</h2>
      ${qreg ? `<p><button id="qnav" class="navbtn" onclick="openModal('${esc(loginUrl('qnav:course', qreg))}')">${esc(navLabel)}</button> <span class="muted">(ReachQuizzes, client ID ${esc(qreg.client_id)})</span></p>`
        : role === 'teacher' ? `<p><button id="install-quizzes" onclick="openModal('${esc(qregUrl)}')">Install ReachQuizzes (Dynamic Registration)</button></p>` : '<p class="muted">Not installed.</p>'}
      </main>
      <div id="modal"><div class="box"><div class="bar"><span>ReachStudio</span><button onclick="closeModal()">✕</button></div><iframe id="modal-frame" title="Tool"></iframe></div></div>
      <script>
        function openModal(u){document.getElementById('modal-frame').src=u;document.getElementById('modal').style.display='grid'}
        function closeModal(){document.getElementById('modal').style.display='none';document.getElementById('modal-frame').src='about:blank'}
        window.addEventListener('message',function(e){var d=e.data||{};
          if(d.subject==='mock.dl_done'||d.subject==='org.imsglobal.lti.close'){closeModal();location.reload()}
          if(d.subject==='lti.frameResize'){document.querySelectorAll('iframe.embed').forEach(function(f){if(f.contentWindow===e.source)f.style.height=(Number(d.height)+4)+'px'})}
        });
      </script></body></html>`);
  });

  return { app, state, base, privateKey, kid };
}
