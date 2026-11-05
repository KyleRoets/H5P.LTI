// Renders one piece of content inside ReachLMS (embedded iframe, module item or assignment).
import { h, makeApi, toast } from './util.js';
import { icon } from './icons.js';
import { renderContent } from './types/index.js';

const BOOT = window.BOOT;
const api = makeApi(() => BOOT.token);
const root = document.getElementById('player');

const status = h('span', { class: 'rs-status' });
let lastSent = null;

async function report(score, max) {
  if (BOOT.preview || !max) return;
  const key = `${score}/${max}`;
  if (key === lastSent) return;
  lastSent = key;
  try {
    const r = await api.post('/api/score', { score, max });
    if (r.passback === 'sent') status.replaceChildren(icon('check', { size: 14 }), ` Score ${r.score}/${r.max} sent to the gradebook`);
    else if (r.passback === 'failed') status.textContent = 'Your score could not be sent to the gradebook — please tell your teacher.';
  } catch (e) { toast(e.message, 'error'); }
}

async function editInStudio() {
  try {
    const { token } = await api.post('/api/session/handoff');
    window.open(`/studio?t=${encodeURIComponent(token)}#edit/${BOOT.content.id}`, '_blank', 'noopener');
  } catch (e) { toast(e.message, 'error'); }
}

const content = renderContent(BOOT.content.type, BOOT.content.data, { report });
document.body.style.background = BOOT.content.data.style?.bg || '';
root.append(...[
  (BOOT.graded || BOOT.canEdit) && h('div', { class: 'rs-toolbar' },
    BOOT.graded && h('span', { class: 'graded-tag' }, icon('award', { size: 14 }), 'Graded activity'),
    status,
    BOOT.canEdit && h('button', { class: 'btn sm', type: 'button', title: 'You own this content', onclick: editInStudio }, icon('edit', { size: 14 }), h('span', {}, 'Edit in ReachStudio'))),
  content].filter(Boolean));

// Tell ReachLMS (Canvas) how tall the content is so the iframe fits without scrollbars.
let lastH = 0;
const sendHeight = () => {
  const height = Math.ceil(document.documentElement.scrollHeight);
  if (Math.abs(height - lastH) < 4) return;
  lastH = height;
  window.parent?.postMessage({ subject: 'lti.frameResize', height }, '*');
};
new ResizeObserver(sendHeight).observe(document.body);
window.addEventListener('load', sendHeight);
