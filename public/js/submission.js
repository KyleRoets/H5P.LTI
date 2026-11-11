// Snapshots of a learner's finished activity: captured when they submit, shown to the lecturer in
// SpeedGrader and in the assignment's results list. Shown only in a sandboxed frame (no scripts).
import { h } from './util.js';

/** The activity as it looks now, with typed answers and choices baked into the HTML. */
export function takeSnapshot(el) {
  const copy = el.cloneNode(true);
  const src = el.querySelectorAll('input, textarea, select');
  const dst = copy.querySelectorAll('input, textarea, select');
  src.forEach((s, i) => {
    const d = dst[i]; if (!d) return;
    if (s.tagName === 'TEXTAREA') d.textContent = s.value;
    else if (s.tagName === 'SELECT') [...d.options].forEach((o, j) => { if (s.options[j]?.selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
    else if (s.type === 'checkbox' || s.type === 'radio') { if (s.checked) d.setAttribute('checked', ''); else d.removeAttribute('checked'); }
    else d.setAttribute('value', s.value);
    d.setAttribute('disabled', '');
  });
  copy.querySelectorAll('video, audio').forEach((m) => { m.removeAttribute('autoplay'); m.setAttribute('preload', 'none'); });
  copy.querySelectorAll('.rs-drag-layer, .toast').forEach((n) => n.remove());
  return copy.outerHTML;
}

/** Read-only view of a snapshot that grows to fit its content. */
export function snapshotFrame(html, build) {
  const frame = h('iframe', { class: 'snapshot-frame', title: 'Submitted work', sandbox: 'allow-same-origin', loading: 'lazy' });
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/app.css?v=${encodeURIComponent(build || '')}">
<style>html,body{margin:0;background:transparent}body{padding:14px}.rs-actions .btn:not(.hidden){pointer-events:none}</style></head>
<body class="player-body snapshot-body rs-assignment rs-no-reveal">${html || '<p class="rs-status">No snapshot was saved for this attempt.</p>'}</body></html>`;
  const fit = () => {
    try {
      const d = frame.contentDocument; if (!d?.body) return;
      frame.style.height = `${Math.max(120, Math.ceil(d.documentElement.scrollHeight))}px`;
    } catch { /* not ready */ }
  };
  frame.addEventListener('load', () => {
    fit();
    try { frame.contentDocument.querySelectorAll('img').forEach((img) => img.addEventListener('load', fit)); } catch { /* ignore */ }
    setTimeout(fit, 300); setTimeout(fit, 1200);
  });
  return frame;
}

export const fmtWhen = (s) => (s ? new Date(`${String(s).replace(' ', 'T')}Z`).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
