// A small mock of ReachLMS / Canvas acting as an LTI 1.3 platform, for local testing.
// Implements: Dynamic Registration, OIDC auth (form_post), signed id_tokens, deep-link return,
// client_credentials token endpoint and AGS score endpoint. Run: node test/mock-canvas.js
import express from 'express';
import { generateKeyPair, exportJWK, SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const USERS = {
  teacher: { sub: 'user-teacher-1', name: 'Taylor Teacher', given_name: 'Taylor', family_name: 'Teacher', email: 'taylor@school.test', roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'] },
  student: { sub: 'user-student-1', name: 'Sam Student', given_name: 'Sam', family_name: 'Student', email: 'sam@school.test', roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'] },
};

export async function startMockCanvas({ port = 4000, toolUrl = 'http://localhost:3000' } = {}) {
  const base = `http://localhost:${port}`;
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const kid = 'mock-canvas-key';
  const pubJwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  const state = {
    regToken: crypto.randomBytes(12).toString('hex'),
    registration: null, // { client_id, payload }
    deploymentId: 'deployment-1',
    page: [], // embedded content items in the course page (RCE)
    assignments: [], // { id, title, lineItem, item, scores: {} }
    issuedTokens: new Set(),
    log: [],
  };
  const log = (m) => { state.log.push(m); };

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ type: ['application/json', 'application/vnd.ims.lis.v1.score+json'] }));

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
    state.registration = { client_id: '10000000000042', payload: p };
    log('registered tool');
    res.json({ ...p, client_id: state.registration.client_id, 'https://purl.imsglobal.org/spec/lti-tool-configuration': { ...p['https://purl.imsglobal.org/spec/lti-tool-configuration'], deployment_id: state.deploymentId } });
  });

  // OIDC authorization: the tool redirects the browser here, we answer with an auto-posting form.
  app.get('/api/lti/authorize_redirect', async (req, res) => {
    const q = req.query;
    const reg = state.registration;
    if (!reg || q.client_id !== reg.client_id) return res.status(400).send('unknown client_id');
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
      const [where, idx] = arg.split('-');
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
    } else if (kind === 'nav') {
      claims['https://purl.imsglobal.org/spec/lti/claim/message_type'] = 'LtiResourceLinkRequest';
      claims['https://purl.imsglobal.org/spec/lti/claim/resource_link'] = { id: 'rl-nav' };
      claims['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'] = `${toolUrl}/lti/launch?placement=course_navigation`;
      claims['https://www.instructure.com/placement'] = 'course_navigation';
    } else return res.status(400).send('bad lti_message_hint');
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
      const jwks = createRemoteJWKSet(new URL(reg.payload.jwks_uri));
      const { payload } = await jwtVerify(req.body.JWT, jwks, { issuer: reg.client_id, audience: base });
      if (payload['https://purl.imsglobal.org/spec/lti/claim/message_type'] !== 'LtiDeepLinkingResponse') throw new Error('wrong message type');
      if (payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id'] !== state.deploymentId) throw new Error('wrong deployment');
      const items = payload['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'] || [];
      const placement = req.query.placement;
      for (const item of items) {
        if (placement === 'assignment_selection') {
          state.assignments.push({ id: state.assignments.length, title: item.lineItem?.label || item.title, lineItem: item.lineItem || null, item, scores: {} });
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
  app.post('/login/oauth2/token', async (req, res) => {
    try {
      const reg = state.registration;
      if (req.body.grant_type !== 'client_credentials') throw new Error('bad grant_type');
      const jwks = createRemoteJWKSet(new URL(reg.payload.jwks_uri));
      await jwtVerify(req.body.client_assertion, jwks, { issuer: reg.client_id, subject: reg.client_id, audience: `${base}/login/oauth2/token` });
      const token = crypto.randomBytes(16).toString('hex');
      state.issuedTokens.add(token);
      res.json({ access_token: token, token_type: 'Bearer', expires_in: 3600, scope: req.body.scope });
    } catch (e) { res.status(400).json({ error: 'invalid_client', error_description: e.message }); }
  });

  app.post('/api/lti/courses/1/line_items/:id/scores', (req, res) => {
    const tok = (req.get('authorization') || '').replace('Bearer ', '');
    if (!state.issuedTokens.has(tok)) return res.status(401).json({ error: 'unauthorized' });
    const a = state.assignments[Number(req.params.id)];
    if (!a) return res.status(404).json({ error: 'no line item' });
    a.scores[req.body.userId] = req.body;
    log(`score ${req.body.scoreGiven}/${req.body.scoreMaximum} for ${req.body.userId} on "${a.title}"`);
    res.json({ resultUrl: `${base}/results/1` });
  });

  app.get('/state', (req, res) => res.json({ registered: !!state.registration, page: state.page, assignments: state.assignments, log: state.log }));

  // A simple "course page" UI to click through the whole flow in a browser.
  app.get('/', (req, res) => {
    const role = req.query.as === 'student' ? 'student' : 'teacher';
    const reg = state.registration;
    const loginUrl = (hint) => `${toolUrl}/lti/login?${new URLSearchParams({ iss: base, login_hint: role, client_id: reg?.client_id || '', lti_deployment_id: state.deploymentId, target_link_uri: `${toolUrl}/lti/launch`, lti_message_hint: hint })}`;
    const regUrl = `${toolUrl}/lti/register?${new URLSearchParams({ openid_configuration: `${base}/api/lti/security/openid-configuration`, registration_token: state.regToken })}`;
    const pageEmbeds = state.page.map((item, i) => `<iframe class="embed" title="${esc(item.title)}" src="${esc(loginUrl(`rl:page-${i}`))}" style="width:100%;max-width:${item.iframe?.width || 800}px;height:${item.iframe?.height || 500}px"></iframe>`).join('');
    const assignments = state.assignments.map((a, i) => `<li><strong>${esc(a.title)}</strong> (${a.lineItem ? `${a.lineItem.scoreMaximum} pts` : 'ungraded'})
        — <button onclick="openModal('${esc(loginUrl(`rl:assign-${i}`))}')">Open</button>
        ${Object.values(a.scores).map((s) => `<span class="score">Gradebook: ${s.scoreGiven}/${s.scoreMaximum}</span>`).join('')}</li>`).join('');
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Mock ReachLMS</title><style>
      body{font-family:system-ui,sans-serif;margin:0;background:#f5f5f5;color:#2d3b45}
      header{background:#1b2a4a;color:#fff;padding:12px 20px;display:flex;gap:16px;align-items:center}
      header a{color:#fff} main{max-width:1000px;margin:20px auto;background:#fff;padding:20px 28px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
      .rce{border:1px solid #c7cdd1;border-radius:4px} .rce-bar{border-bottom:1px solid #c7cdd1;padding:6px;display:flex;gap:4px;background:#f5f5f5}
      .rce-bar button{border:1px solid transparent;background:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:14px}
      .rce-bar button:hover{border-color:#c7cdd1;background:#fff} .rce-body{padding:12px;min-height:80px}
      iframe.embed{border:1px solid #ddd;display:block;margin:10px 0} .score{background:#e3f6ec;color:#0f5f3c;padding:2px 8px;border-radius:9px;margin-left:6px}
      #modal{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;place-items:center;z-index:9}
      #modal .box{background:#fff;width:min(1100px,96vw);height:min(720px,92vh);border-radius:6px;overflow:hidden;display:flex;flex-direction:column}
      #modal .bar{padding:8px 12px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;font-weight:600}
      #modal iframe{flex:1;border:0;width:100%} .muted{color:#6b7780;font-size:14px}</style></head><body>
      <header><strong>Mock ReachLMS</strong><span>Biology 101</span><span style="flex:1"></span>
        Viewing as: <a href="/?as=teacher">${role === 'teacher' ? '<b>Teacher</b>' : 'Teacher'}</a> | <a href="/?as=student">${role === 'student' ? '<b>Student</b>' : 'Student'}</a></header>
      <main>
      ${reg ? `<p class="muted">Reach Studio is installed (client ID ${esc(reg.client_id)}).</p>` : `<p><button id="install" onclick="openModal('${esc(regUrl)}')">Install Reach Studio (Dynamic Registration)</button></p>`}
      <h2>Week 1: Cells</h2>
      ${role === 'teacher' && reg ? `<div class="rce"><div class="rce-bar"><button><b>B</b></button><button><i>I</i></button><button>🔗</button>
        <button id="rce-tool" title="Reach Studio" onclick="openModal('${esc(loginUrl('dl:editor_button'))}')"><img src="${toolUrl}/img/icon.svg" width="16" height="16" alt=""> Reach Studio</button></div>
        <div class="rce-body">Welcome to the cells unit! <span class="muted">(Rich Content Editor — use the Reach Studio button to embed content.)</span></div></div>` : ''}
      <div id="page">${pageEmbeds || '<p class="muted">No embedded content yet.</p>'}</div>
      <h2>Assignments</h2>
      ${role === 'teacher' && reg ? `<p><button id="new-assignment" onclick="openModal('${esc(loginUrl('dl:assignment_selection'))}')">+ Assignment → External Tool → Reach Studio</button></p>` : ''}
      <ul>${assignments || '<li class="muted">None</li>'}</ul>
      ${role === 'teacher' && reg ? `<p><button onclick="openModal('${esc(loginUrl('nav:course'))}')">Course navigation: Reach Studio</button></p>` : ''}
      </main>
      <div id="modal"><div class="box"><div class="bar"><span>Reach Studio</span><button onclick="closeModal()">✕</button></div><iframe id="modal-frame" title="Tool"></iframe></div></div>
      <script>
        function openModal(u){document.getElementById('modal-frame').src=u;document.getElementById('modal').style.display='grid'}
        function closeModal(){document.getElementById('modal').style.display='none';document.getElementById('modal-frame').src='about:blank'}
        window.addEventListener('message',function(e){var d=e.data||{};
          if(d.subject==='mock.dl_done'||d.subject==='org.imsglobal.lti.close'){closeModal();location.reload()}
          if(d.subject==='lti.frameResize'){document.querySelectorAll('iframe.embed').forEach(function(f){if(f.contentWindow===e.source)f.style.height=(Number(d.height)+4)+'px'})}
        });
      </script></body></html>`);
  });

  const server = await new Promise((resolve) => { const s = app.listen(port, () => resolve(s)); });
  return { server, base, state, close: () => new Promise((r) => server.close(r)), privateKey, kid };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const toolUrl = process.env.TOOL_URL || 'http://localhost:3000';
  const m = await startMockCanvas({ port: Number(process.env.MOCK_PORT || 4000), toolUrl });
  console.log(`Mock ReachLMS running at ${m.base} (tool: ${toolUrl}). Start the tool with ALLOW_INSECURE_PLATFORMS=true.`);
}
