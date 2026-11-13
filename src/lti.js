// LTI 1.3 / LTI Advantage implementation for Canvas (ReachLMS):
//  - OIDC third-party login  (/lti/login)
//  - Launch validation       (/lti/launch)   LtiResourceLinkRequest + LtiDeepLinkingRequest
//  - Deep Linking responses  (signed JWT posted back to Canvas)
//  - Assignment & Grade Services score passback (client_credentials + private_key_jwt)
//  - Dynamic Registration    (/lti/register)
//  - Manual Canvas JSON config (/lti/canvas-config.json) and tool JWKS (/.well-known/jwks.json)
import express from 'express';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { db, newId } from './db.js';
import { config, internalUrl } from './config.js';
import { signingKey, publicJwks } from './keys.js';
import { createSession } from './sessions.js';
import { views } from './views.js';
import { TYPES, embedSize, gradingFor } from './types.js';

const C = {
  MSG: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  VER: 'https://purl.imsglobal.org/spec/lti/claim/version',
  DEP: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  ROLES: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  CTX: 'https://purl.imsglobal.org/spec/lti/claim/context',
  RL: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  CUSTOM: 'https://purl.imsglobal.org/spec/lti/claim/custom',
  TARGET: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  DL: 'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
  AGS: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
  CANVAS_PLACEMENT: 'https://www.instructure.com/placement',
  TOOL_CFG: 'https://purl.imsglobal.org/spec/lti-tool-configuration',
  PLATFORM_CFG: 'https://purl.imsglobal.org/spec/lti-platform-configuration',
};

export const SCOPES = [
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  'https://purl.imsglobal.org/spec/lti-ags/scope/score',
  'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
];

const INSTRUCTOR_ROLES = ['#Instructor', '#Administrator', '#ContentDeveloper', '#TeachingAssistant', 'membership/Instructor'];
const url = (p) => `${config.publicUrl}${p}`;
const iconUrl = () => url('/img/icon-64.png');

// ---------- platform helpers ----------
export function findPlatform(issuer, clientId) {
  if (clientId) return db.prepare('SELECT * FROM platforms WHERE issuer = ? AND client_id = ?').get(issuer, String(clientId));
  const rows = db.prepare('SELECT * FROM platforms WHERE issuer = ?').all(issuer);
  return rows.length === 1 ? rows[0] : null;
}

export function upsertPlatform(p) {
  db.prepare(`INSERT INTO platforms (name, issuer, client_id, auth_url, token_url, jwks_url)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(issuer, client_id) DO UPDATE SET name=excluded.name, auth_url=excluded.auth_url,
              token_url=excluded.token_url, jwks_url=excluded.jwks_url`)
    .run(p.name || p.issuer, p.issuer, String(p.client_id), p.auth_url, p.token_url, p.jwks_url);
  return findPlatform(p.issuer, p.client_id);
}

const jwksCache = new Map();
function platformJwks(platform) {
  if (!jwksCache.has(platform.jwks_url)) jwksCache.set(platform.jwks_url, createRemoteJWKSet(new URL(internalUrl(platform.jwks_url))));
  return jwksCache.get(platform.jwks_url);
}

function isInstructor(roles = []) {
  return roles.some((r) => INSTRUCTOR_ROLES.some((x) => r.includes(x)));
}
// ReachLMS account or site admins (Canvas sends institution/system roles, often with no course role).
const ADMIN_ROLES = ['institution/person#Administrator', 'system/person#Administrator', 'system/person#SysAdmin', 'system/person#AccountAdmin'];
const isLmsAdmin = (roles = []) => roles.some((r) => ADMIN_ROLES.some((x) => r.includes(x)));

/**
 * Who may open a submitted attempt (SpeedGrader / submission details):
 * - teachers, TAs and designers of the course it belongs to;
 * - ReachLMS admins, and ReachStudio admins, from any course on the same ReachLMS site;
 * - the student who submitted it.
 * Returns { ok } or { ok: false, title, why } with a reason the person can act on.
 */
export function canReview(sub, { platform, lti, payload, userId }) {
  if (!sub) {
    return { ok: false, title: 'Submission not found in ReachStudio', why: 'ReachStudio no longer has this attempt. This happens when its data was reset (for example a redeploy on a server without a persistent disk) after the student submitted. The grade in ReachLMS is unaffected; attempts submitted from now on can be opened.' };
  }
  const subPlatform = db.prepare('SELECT issuer FROM platforms WHERE id = ?').get(sub.platform_id);
  // Same ReachLMS site, even if ReachStudio was registered more than once (several client IDs).
  if (!subPlatform || subPlatform.issuer !== platform.issuer) return { ok: false, title: 'Submission not available', why: 'This attempt was made on a different ReachLMS site.' };
  const roles = lti.roles || [];
  const studioAdmin = !!userId && db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'admin' AND status = 'active'").get(userId);
  if (isLmsAdmin(roles) || studioAdmin) return { ok: true };
  const sameCourse = !sub.context_id || !lti.contextId || sub.context_id === lti.contextId;
  if (lti.instructor && sameCourse) return { ok: true };
  if (payload.sub && sub.sub === payload.sub) return { ok: true };
  if (lti.instructor) return { ok: false, title: 'Submission not available', why: 'This attempt belongs to a course you don\'t teach. Open it from SpeedGrader in its own course, or ask a ReachLMS admin.' };
  const shown = roles.map((r) => r.split(/[#/]/).pop()).filter((r, i, a) => r && a.indexOf(r) === i).join(', ') || 'none';
  return { ok: false, title: 'Submission not available', why: `Only the course's teachers, ReachLMS admins and the student who submitted it can view this attempt. ReachLMS sent your role as: ${shown}.` };
}

// ---------- tool configuration (manual install + dynamic registration) ----------
// Canvas reads the pop-up size for the editor and assignment pickers from launch_width/height
// (it maps them to selection_width/height). Without them the editor dialog is a small 800×550.
const PICKER = { 'https://canvas.instructure.com/lti/launch_width': 1200, 'https://canvas.instructure.com/lti/launch_height': 900 };
function messages() {
  return [
    {
      type: 'LtiDeepLinkingRequest',
      target_link_uri: url('/lti/launch?placement=editor_button'),
      label: config.toolName,
      icon_uri: iconUrl(),
      placements: ['editor_button'],
      ...PICKER,
    },
    {
      type: 'LtiDeepLinkingRequest',
      target_link_uri: url('/lti/launch?placement=assignment_selection'),
      label: `${config.toolName} activity`,
      icon_uri: iconUrl(),
      placements: ['assignment_selection'],
      ...PICKER,
    },
    {
      // Shows "ReachStudio" in an assignment's Submission Type list (next to External Tool).
      type: 'LtiDeepLinkingRequest',
      target_link_uri: url('/lti/launch?placement=submission_type_selection'),
      label: config.toolName,
      icon_uri: iconUrl(),
      placements: ['submission_type_selection'],
      ...PICKER,
    },
    {
      type: 'LtiDeepLinkingRequest',
      target_link_uri: url('/lti/launch?placement=link_selection'),
      label: `${config.toolName} activity`,
      icon_uri: iconUrl(),
      placements: ['link_selection'],
      ...PICKER,
    },
    {
      type: 'LtiResourceLinkRequest',
      target_link_uri: url('/lti/launch?placement=course_navigation'),
      label: config.toolName,
      icon_uri: iconUrl(),
      placements: ['course_navigation'],
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
      'https://canvas.instructure.com/lti/course_navigation/default_enabled': false,
      // Open inside ReachLMS, with the course menu still showing (never a new window).
      'https://canvas.instructure.com/lti/display_type': 'default',
    },
  ];
}

export function registrationPayload() {
  const domain = new URL(config.publicUrl).host;
  return {
    application_type: 'web',
    client_name: config.toolName,
    client_uri: config.publicUrl,
    logo_uri: iconUrl(),
    grant_types: ['client_credentials', 'implicit'],
    response_types: ['id_token'],
    initiate_login_uri: url('/lti/login'),
    redirect_uris: [url('/lti/launch')],
    jwks_uri: url('/.well-known/jwks.json'),
    token_endpoint_auth_method: 'private_key_jwt',
    scope: SCOPES.join(' '),
    [C.TOOL_CFG]: {
      domain,
      target_link_uri: url('/lti/launch'),
      description: 'Build hotspot images, slides, interactive video, quizzes and more, and embed them anywhere in ReachLMS.',
      claims: ['sub', 'iss', 'name', 'given_name', 'family_name', 'email', 'locale'],
      messages: messages(),
      'https://canvas.instructure.com/lti/privacy_level': 'public',
      'https://canvas.instructure.com/lti/tool_id': 'reach-studio',
      'https://canvas.instructure.com/lti/vendor': 'ReachLMS',
    },
  };
}

export function canvasJsonConfig() {
  const domain = new URL(config.publicUrl).host;
  return {
    title: config.toolName,
    description: 'Build and embed interactive content (hotspots, slides, interactive video, quizzes, drag and drop and more).',
    oidc_initiation_url: url('/lti/login'),
    target_link_uri: url('/lti/launch'),
    public_jwk_url: url('/.well-known/jwks.json'),
    scopes: SCOPES,
    extensions: [{
      platform: 'canvas.instructure.com',
      domain,
      tool_id: 'reach-studio',
      privacy_level: 'public',
      settings: {
        text: config.toolName,
        icon_url: iconUrl(),
        placements: [
          { placement: 'editor_button', message_type: 'LtiDeepLinkingRequest', target_link_uri: url('/lti/launch?placement=editor_button'), text: config.toolName, icon_url: iconUrl(), selection_width: 1200, selection_height: 900 },
          { placement: 'assignment_selection', message_type: 'LtiDeepLinkingRequest', target_link_uri: url('/lti/launch?placement=assignment_selection'), text: `${config.toolName} activity`, selection_width: 1200, selection_height: 900 },
          { placement: 'submission_type_selection', message_type: 'LtiDeepLinkingRequest', target_link_uri: url('/lti/launch?placement=submission_type_selection'), text: config.toolName, description: 'Interactive activity graded automatically or in SpeedGrader', selection_width: 1200, selection_height: 900 },
          { placement: 'link_selection', message_type: 'LtiDeepLinkingRequest', target_link_uri: url('/lti/launch?placement=link_selection'), text: `${config.toolName} activity`, selection_width: 1200, selection_height: 900 },
          { placement: 'course_navigation', message_type: 'LtiResourceLinkRequest', target_link_uri: url('/lti/launch?placement=course_navigation'), text: config.toolName, default: 'disabled', display_type: 'default', required_permissions: 'manage_course_content_add' },
        ],
      },
    }],
  };
}

// ---------- AGS: access token + score passback ----------
const tokenCache = new Map();
export async function getAccessToken(platform, scopes) {
  const key = `${platform.id}|${scopes.join(' ')}`;
  const cached = tokenCache.get(key);
  if (cached && cached.exp > Date.now() + 30000) return cached.token;
  const k = signingKey();
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: k.kid, typ: 'JWT' })
    .setIssuer(platform.client_id).setSubject(platform.client_id)
    .setAudience(platform.token_url).setIssuedAt().setExpirationTime('5m').setJti(newId())
    .sign(k.privateKey);
  const res = await fetch(internalUrl(platform.token_url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      scope: scopes.join(' '),
    }),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${await res.text()}`);
  const body = await res.json();
  tokenCache.set(key, { token: body.access_token, exp: Date.now() + (body.expires_in || 3600) * 1000 });
  return body.access_token;
}

/**
 * Sends a result to the ReachLMS gradebook and creates a submission in SpeedGrader.
 * auto:   activityProgress Completed + gradingProgress FullyGraded with the score.
 * manual: activityProgress Submitted + gradingProgress PendingManual and no score, so the
 *         submission shows as "needs grading" (a grade the lecturer already gave is kept).
 * reviewUrl is stored as a basic_lti_launch submission: SpeedGrader launches it to show the attempt.
 */
export async function postScore(platform, lineitem, { sub, scoreGiven, scoreMaximum, mode = 'auto', reviewUrl, submittedAt = new Date() }) {
  const token = await getAccessToken(platform, ['https://purl.imsglobal.org/spec/lti-ags/scope/score']);
  const u = new URL(lineitem);
  u.pathname = u.pathname.replace(/\/$/, '') + '/scores';
  const manual = mode === 'manual';
  const body = {
    userId: sub,
    scoreMaximum,
    activityProgress: manual ? 'Submitted' : 'Completed',
    gradingProgress: manual ? 'PendingManual' : 'FullyGraded',
    timestamp: new Date().toISOString(),
    'https://canvas.instructure.com/lti/submission': {
      new_submission: true,
      submission_type: reviewUrl ? 'basic_lti_launch' : 'external_tool',
      ...(reviewUrl ? { submission_data: reviewUrl } : {}),
      submitted_at: submittedAt.toISOString(),
      ...(manual ? { preserve_score: true } : {}),
    },
  };
  if (!manual) body.scoreGiven = scoreGiven;
  const res = await fetch(internalUrl(u), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.ims.lis.v1.score+json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Score passback failed (${res.status}): ${await res.text()}`);
  return true;
}

// ---------- Deep linking response ----------
export const GRADED_PLACEMENTS = ['assignment_selection', 'submission_type_selection'];
export async function buildDeepLinkResponse(lti, content) {
  const platform = db.prepare('SELECT * FROM platforms WHERE id = ?').get(lti.platformId);
  const type = TYPES[content.type] || {};
  const data = JSON.parse(content.data);
  const grading = gradingFor(content.type, data);
  const item = {
    type: 'ltiResourceLink',
    title: content.title,
    url: url(`/lti/launch?content=${content.id}`),
    custom: { content_id: content.id },
    icon: { url: iconUrl(), width: 64, height: 64 },
  };
  const size = embedSize(content.type, data);
  if (lti.placement === 'editor_button' || !lti.placement) {
    item.iframe = { width: size.width, height: size.height };
  }
  if (GRADED_PLACEMENTS.includes(lti.placement)) {
    // Shown inside the assignment page in ReachLMS (room for the assignment bar on top).
    item.iframe = { width: size.width, height: size.height + 140 };
    // Every assignment gets points: auto-marked items use their own maximum, the rest are
    // graded by the lecturer in SpeedGrader out of the points set on the Grading tab.
    item.lineItem = { scoreMaximum: grading.max, label: content.title, resourceId: content.id, tag: 'reach-studio' };
    // Keep the name the lecturer gave the assignment (Canvas otherwise renames it to the item's title).
    item['https://canvas.instructure.com/lti/preserveExistingAssignmentName'] = true;
  }
  const k = signingKey();
  const claims = {
    nonce: newId(16),
    [C.MSG]: 'LtiDeepLinkingResponse',
    [C.VER]: '1.3.0',
    [C.DEP]: lti.deploymentId,
    'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [item],
    'https://purl.imsglobal.org/spec/lti-dl/claim/msg': `Added "${content.title}"`,
  };
  if (lti.dl?.data) claims['https://purl.imsglobal.org/spec/lti-dl/claim/data'] = lti.dl.data;
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: k.kid, typ: 'JWT' })
    .setIssuer(platform.client_id).setAudience(platform.issuer)
    .setIssuedAt().setExpirationTime('5m')
    .sign(k.privateKey);
  return { returnUrl: lti.dl.returnUrl, jwt, item };
}

// ---------- Router ----------
export const ltiRouter = express.Router();
ltiRouter.use(express.urlencoded({ extended: false }));

ltiRouter.get('/.well-known/jwks.json', (req, res) => res.json(publicJwks()));
ltiRouter.get('/lti/canvas-config.json', (req, res) => res.json(canvasJsonConfig()));

// Step 1: OIDC login initiation (Canvas -> tool), GET or POST.
ltiRouter.all('/lti/login', (req, res) => {
  const p = { ...req.query, ...req.body };
  const platform = findPlatform(p.iss, p.client_id);
  if (!platform) {
    return res.status(400).send(views.message('This ReachLMS site is not registered with Reach Studio',
      `Issuer <code>${views.esc(p.iss)}</code> with client ID <code>${views.esc(p.client_id)}</code> is unknown. Ask your administrator to install the tool using Dynamic Registration.`));
  }
  const state = newId(24);
  const nonce = newId(24);
  db.prepare('INSERT INTO oidc_states (state, nonce, platform_id, created_at) VALUES (?, ?, ?, ?)').run(state, nonce, platform.id, Date.now());
  const auth = new URL(platform.auth_url);
  const params = {
    scope: 'openid',
    response_type: 'id_token',
    response_mode: 'form_post',
    prompt: 'none',
    client_id: platform.client_id,
    redirect_uri: url('/lti/launch'),
    login_hint: p.login_hint,
    state,
    nonce,
  };
  if (p.lti_message_hint) params.lti_message_hint = p.lti_message_hint;
  for (const [k, v] of Object.entries(params)) if (v !== undefined) auth.searchParams.set(k, v);
  res.redirect(302, auth.toString());
});

// Step 3: authentication response = the actual launch.
ltiRouter.post('/lti/launch', async (req, res) => {
  try {
    const { id_token: idToken, state } = req.body;
    if (!idToken || !state) throw new Error('Missing id_token or state.');
    const st = db.prepare('SELECT * FROM oidc_states WHERE state = ?').get(state);
    if (!st) throw new Error('Unknown or expired launch state. Please try again.');
    db.prepare('DELETE FROM oidc_states WHERE state = ?').run(state); // single use
    const platform = db.prepare('SELECT * FROM platforms WHERE id = ?').get(st.platform_id);

    const { payload } = await jwtVerify(idToken, platformJwks(platform), {
      issuer: platform.issuer,
      audience: platform.client_id,
      algorithms: ['RS256'],
      clockTolerance: 60,
    });
    if (payload.nonce !== st.nonce) throw new Error('Nonce mismatch.');
    if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== platform.client_id) throw new Error('Invalid azp.');
    if (payload[C.VER] !== '1.3.0') throw new Error('Unsupported LTI version.');
    const deploymentId = payload[C.DEP];
    if (!deploymentId) throw new Error('Missing deployment_id.');
    db.prepare('INSERT OR IGNORE INTO deployments (platform_id, deployment_id) VALUES (?, ?)').run(platform.id, deploymentId);

    const roles = payload[C.ROLES] || [];
    const target = payload[C.TARGET] || '';
    let placement = payload[C.CANVAS_PLACEMENT] || null;
    try { placement = placement || new URL(target).searchParams.get('placement'); } catch { /* ignore */ }
    const custom = payload[C.CUSTOM] || {};
    let reviewId = null;
    try { reviewId = new URL(target).searchParams.get('review'); } catch { /* ignore */ }
    let contentId = custom.content_id || null;
    try { contentId = contentId || new URL(target).searchParams.get('content'); } catch { /* ignore */ }

    const lti = {
      platformId: platform.id,
      platformName: platform.name,
      deploymentId,
      sub: payload.sub,
      name: payload.name || [payload.given_name, payload.family_name].filter(Boolean).join(' '),
      email: payload.email || '',
      roles,
      instructor: isInstructor(roles),
      context: payload[C.CTX]?.title || '',
      contextId: payload[C.CTX]?.id || null,
      resourceLinkId: payload[C.RL]?.id || null,
      placement,
    };
    const identity = payload.sub
      ? db.prepare('SELECT user_id FROM lti_identities WHERE platform_id = ? AND sub = ? AND active = 1').get(platform.id, payload.sub)
      : null;
    const userId = identity?.user_id || null;

    const msgType = payload[C.MSG];
    if (msgType === 'LtiDeepLinkingRequest') {
      const dl = payload[C.DL] || {};
      if (!dl.deep_link_return_url) throw new Error('Missing deep_link_return_url.');
      lti.kind = 'deeplink';
      lti.dl = { returnUrl: dl.deep_link_return_url, data: dl.data, acceptMultiple: !!dl.accept_multiple };
      const token = createSession(userId, lti);
      return res.send(views.studio(token));
    }

    if (msgType === 'LtiResourceLinkRequest') {
      // SpeedGrader (or a student's submission details) opening a submitted attempt.
      if (reviewId) {
        const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(reviewId);
        const access = canReview(sub, { platform, lti, payload, userId });
        if (!access.ok) {
          console.warn(`Review ${reviewId} refused: ${access.why} roles=${JSON.stringify(lti.roles)} context=${lti.contextId} sub_context=${sub?.context_id}`);
          return res.status(sub ? 403 : 404).send(views.message(access.title, views.esc(access.why)));
        }
        // Staff (anyone allowed who isn't the student themself) see the full lecturer view.
        lti.instructor = sub.sub !== payload.sub || lti.instructor;
        lti.kind = 'review';
        lti.reviewId = reviewId;
        lti.reviewContentId = sub.content_id;
        lti.reviewSub = sub.sub;
        lti.reviewLink = sub.resource_link_id;
        const token = createSession(userId, lti);
        return res.send(views.review(token));
      }
      if (contentId) {
        const content = db.prepare('SELECT * FROM contents WHERE id = ?').get(contentId);
        if (!content) return res.status(404).send(views.message('Content not found', 'This interactive content may have been deleted by its owner.'));
        const ags = payload[C.AGS];
        lti.kind = 'player';
        lti.contentId = contentId;
        const assignment = !!ags?.lineitem && (ags.scope || []).includes('https://purl.imsglobal.org/spec/lti-ags/scope/score');
        if (assignment && !lti.instructor) lti.ags = { lineitem: ags.lineitem };
        // A lecturer opening the assignment sees the activity plus their students' results.
        if (assignment && lti.instructor) lti.teacherAssignment = true;
        const token = createSession(userId, lti);
        const canEdit = !!userId && userId === content.user_id;
        return res.send(views.player(token, content, {
          canEdit, graded: !!lti.ags, teacher: !!lti.teacherAssignment,
          grading: assignment ? gradingFor(content.type, JSON.parse(content.data)) : null,
        }));
      }
      // Course navigation (or any launch without content) opens the library.
      if (!lti.instructor) return res.send(views.message(config.toolName, 'Your teachers use ReachStudio to build interactive activities. You will find them inside your course pages, quizzes and assignments.'));
      lti.kind = 'studio';
      const token = createSession(userId, lti);
      return res.send(views.studio(token));
    }
    throw new Error(`Unsupported message type: ${msgType}`);
  } catch (err) {
    console.error('Launch error:', err);
    res.status(400).send(views.message('Launch failed', views.esc(err.message)));
  }
});

// ---------- Dynamic Registration ----------
ltiRouter.get('/lti/register', (req, res) => {
  const { openid_configuration: oc, registration_token: rt } = req.query;
  if (!oc) return res.status(400).send(views.message('Dynamic Registration', `Paste <code>${views.esc(url('/lti/register'))}</code> into ReachLMS → Admin → Developer Keys (or Apps) → + Dynamic Registration.`));
  res.send(views.register(oc, rt || '', !!config.registrationCode));
});

ltiRouter.post('/lti/register', async (req, res) => {
  try {
    const { openid_configuration: oc, registration_token: rt, code } = req.body;
    if (config.registrationCode && code !== config.registrationCode) {
      return res.status(403).send(views.register(oc, rt, true, 'That installation code is not correct.'));
    }
    const ocUrl = new URL(oc);
    if (ocUrl.protocol !== 'https:' && !config.allowInsecure) throw new Error('openid_configuration must use https.');
    const headers = { Accept: 'application/json' };
    if (rt) headers.Authorization = `Bearer ${rt}`;
    const cfgRes = await fetch(internalUrl(ocUrl), { headers });
    if (!cfgRes.ok) throw new Error(`Could not read the platform configuration (${cfgRes.status}).`);
    const pc = await cfgRes.json();
    for (const k of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri', 'registration_endpoint']) {
      if (!pc[k]) throw new Error(`Platform configuration is missing ${k}.`);
    }
    const regRes = await fetch(internalUrl(pc.registration_endpoint), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationPayload()),
    });
    if (!regRes.ok) throw new Error(`Registration was rejected (${regRes.status}): ${await regRes.text()}`);
    const reg = await regRes.json();
    const platformName = pc[C.PLATFORM_CFG]?.['https://canvas.instructure.com/lti/account_name'] || pc.issuer;
    const platform = upsertPlatform({
      name: platformName,
      issuer: pc.issuer,
      client_id: reg.client_id,
      auth_url: pc.authorization_endpoint,
      token_url: pc.token_endpoint,
      jwks_url: pc.jwks_uri,
    });
    const dep = reg[C.TOOL_CFG]?.deployment_id;
    if (dep) db.prepare('INSERT OR IGNORE INTO deployments (platform_id, deployment_id) VALUES (?, ?)').run(platform.id, dep);
    console.log(`Registered platform ${platform.issuer} client_id=${platform.client_id}`);
    res.send(views.registered(platformName, platform.client_id));
  } catch (err) {
    console.error('Registration error:', err);
    res.status(400).send(views.message('Registration failed', views.esc(err.message)));
  }
});

export { C as CLAIMS };
