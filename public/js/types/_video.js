// Video sources shared by "Video" and "Interactive Video": an uploaded file (stored on the
// ReachStudio server), or a YouTube / Vimeo link (hosted by them — uses no ReachStudio storage).
import { h, textField, mediaField, segmentField, safeUrl } from '../util.js';
import { icon } from '../icons.js';

export const ytId = (u) => {
  const m = String(u || '').match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};
/** Vimeo id plus the privacy hash of unlisted videos (vimeo.com/123/abc or ?h=abc). */
export const vimeoInfo = (u) => {
  const s = String(u || '');
  const m = s.match(/vimeo\.com\/(?:video\/|channels\/[\w-]+\/|groups\/[\w-]+\/videos\/)?(\d{5,})(?:\/([\da-f]{6,}))?/i);
  if (!m) return null;
  const hq = s.match(/[?&]h=([\da-f]{6,})/i);
  return { id: m[1], hash: m[2] || hq?.[1] || '' };
};

/**
 * Where the video comes from. Older items stored a YouTube URL or an uploaded path in `video`.
 * Returns { kind: 'upload'|'youtube'|'vimeo', url?, id?, hash? } or null when nothing is set.
 */
export function videoSource(data) {
  const src = data.source || (ytId(data.video) ? 'youtube' : 'upload');
  if (src === 'youtube') { const id = ytId(data.link || data.video); return id ? { kind: 'youtube', id } : null; }
  if (src === 'vimeo') { const v = vimeoInfo(data.link); return v ? { kind: 'vimeo', ...v } : null; }
  const url = safeUrl(data.video);
  return url && !ytId(url) ? { kind: 'upload', url } : null;
}

export const embedUrl = (s) => (s.kind === 'youtube'
  ? `https://www.youtube-nocookie.com/embed/${s.id}?rel=0&modestbranding=1&playsinline=1`
  : `https://player.vimeo.com/video/${s.id}?${s.hash ? `h=${s.hash}&` : ''}dnt=1&title=0&byline=0&portrait=0`);

/** Editor field: Upload a file | YouTube link | Vimeo link. */
export function videoSourceField(data, ctx, onChange) {
  if (!data.source) data.source = ytId(data.video) ? 'youtube' : 'upload';
  if (data.source === 'youtube' && !data.link && ytId(data.video)) { data.link = data.video; data.video = ''; }
  const host = h('div');
  const draw = () => {
    const status = h('p', { class: 'help link-status' });
    const check = () => {
      const s = videoSource(data);
      status.className = `help link-status ${s ? 'ok' : data.link ? 'bad' : ''}`;
      status.replaceChildren(...(s ? [icon('check', { size: 14 }), ` ${s.kind === 'youtube' ? 'YouTube' : 'Vimeo'} video found (ID ${s.id}).`]
        : data.link ? [icon('alert', { size: 14 }), ` That doesn't look like a ${data.source === 'youtube' ? 'YouTube' : 'Vimeo'} video link.`] : []));
    };
    host.replaceChildren(
      segmentField('Video source', data, 'source', [['upload', 'Upload a file', 'upload'], ['youtube', 'YouTube link', 'link'], ['vimeo', 'Vimeo link', 'link']], () => { onChange(); draw(); }, { showText: true }),
      data.source === 'upload'
        ? mediaField('', data, 'video', onChange, ctx, { video: true, accept: 'video/mp4,video/webm', help: 'MP4 (H.264) or WebM. Stored on the ReachStudio server and counts towards your storage. For long videos, a YouTube or Vimeo link uses no storage.' })
        : h('div', {},
          textField('', data, 'link', () => { onChange(); check(); }, { placeholder: data.source === 'youtube' ? 'https://www.youtube.com/watch?v=…' : 'https://vimeo.com/…', help: data.source === 'youtube' ? 'Public or unlisted videos. Shown with YouTube\'s privacy-enhanced player (no cookies until play).' : 'Public or unlisted videos (unlisted links include a code after the number, which is kept). The video\'s privacy settings must allow embedding.' }),
          status));
    check();
  };
  draw();
  return host;
}

// ---- players with one small interface: time(), pause(), play(), seek(t) ----
let ytReady;
function loadYouTube() {
  ytReady ||= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    document.head.append(h('script', { src: 'https://www.youtube.com/iframe_api' }));
  });
  return ytReady;
}
let vimeoReady;
function loadVimeo() {
  vimeoReady ||= new Promise((resolve, reject) => {
    if (window.Vimeo?.Player) return resolve(window.Vimeo);
    const s = h('script', { src: 'https://player.vimeo.com/api/player.js' });
    s.onload = () => resolve(window.Vimeo); s.onerror = reject;
    document.head.append(s);
  });
  return vimeoReady;
}

/** A controllable player (Interactive Video needs the current time to pause at interactions). */
export function makePlayer(src, host, { captions, poster } = {}) {
  const api = { time: () => 0, pause() {}, play() {}, seek() {} };
  if (src.kind === 'youtube') {
    const div = h('div', { class: 'yt' });
    host.append(h('div', { class: 'rs-embed' }, div));
    loadYouTube().then((YT) => {
      const p = new YT.Player(div, { host: 'https://www.youtube-nocookie.com', videoId: src.id, playerVars: { rel: 0, modestbranding: 1, playsinline: 1 } });
      api.time = () => p.getCurrentTime?.() || 0;
      api.pause = () => p.pauseVideo?.();
      api.play = () => p.playVideo?.();
      api.seek = (t) => p.seekTo?.(t, true);
    });
    return api;
  }
  if (src.kind === 'vimeo') {
    const frame = h('iframe', { src: embedUrl(src), allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: true, title: 'Vimeo video' });
    host.append(h('div', { class: 'rs-embed' }, frame));
    let t = 0;
    loadVimeo().then((Vimeo) => {
      const p = new Vimeo.Player(frame);
      p.on('timeupdate', (d) => { t = d.seconds; });
      api.time = () => t;
      api.pause = () => p.pause().catch(() => {});
      api.play = () => p.play().catch(() => {});
      api.seek = (s) => { t = s; p.setCurrentTime(s).catch(() => {}); };
    }).catch(() => {});
    return api;
  }
  const v = h('video', { src: src.url, controls: true, playsinline: true, preload: 'metadata', poster: safeUrl(poster) || undefined },
    safeUrl(captions) && h('track', { kind: 'captions', src: safeUrl(captions), srclang: 'en', label: 'Captions', default: true }));
  host.append(v);
  return { time: () => v.currentTime, pause: () => v.pause(), play: () => v.play(), seek: (s) => { v.currentTime = s; } };
}
