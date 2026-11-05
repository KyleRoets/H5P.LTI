import { h, textField, selectField, mediaField, listEditor, optionsEditor, safeUrl, richField, richBlock, isBlank, choiceQuestion, feedback, fmtTime, parseTime, emptyState, rid } from '../util.js';
import { icon } from '../icons.js';

const ytId = (u) => {
  const m = String(u || '').match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};

let ytReady;
function loadYouTube() {
  ytReady ||= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    document.head.append(h('script', { src: 'https://www.youtube.com/iframe_api' }));
  });
  return ytReady;
}

// Wraps <video> or the YouTube player behind one small interface.
function makePlayer(url, host) {
  const id = ytId(url);
  if (id) {
    const div = h('div', { class: 'yt' });
    host.append(div);
    const api = { time: () => 0, pause() {}, play() {}, seek() {} };
    loadYouTube().then((YT) => {
      const p = new YT.Player(div, { videoId: id, playerVars: { rel: 0, modestbranding: 1, playsinline: 1 } });
      api.time = () => p.getCurrentTime?.() || 0;
      api.pause = () => p.pauseVideo?.();
      api.play = () => p.playVideo?.();
      api.seek = (t) => p.seekTo?.(t, true);
    });
    return api;
  }
  const v = h('video', { src: safeUrl(url), controls: true, playsinline: true, preload: 'metadata' });
  host.append(v);
  return { time: () => v.currentTime, pause: () => v.pause(), play: () => v.play(), seek: (t) => { v.currentTime = t; } };
}

export default {
  id: 'video',
  name: 'Interactive Video',
  icon: 'type-video',
  graded: true,
  tagline: 'A video that pauses at set moments to ask questions or show notes.',
  about: {
    summary: 'Add questions and information pop-ups to a YouTube video or a video you upload. At each moment you choose, the video pauses and shows your question or note; learners answer, then carry on watching.',
    uses: ['Check understanding during a lecture or demonstration', 'Add explanations, definitions or links on top of a video', 'Make learners actively watch instead of skipping through', 'Turn a recorded lesson into a graded activity'],
    learners: 'Learners press play as normal. The video stops at each interaction until they respond. A timeline under the video lets them jump to any interaction.',
    tip: 'Space interactions out (every 1–3 minutes) and keep questions about what was just shown. Use the m:ss time from the video player to set each moment.',
  },
  defaults: () => ({ video: '', interactions: [] }),
  example: () => ({
    title: 'A closer look at a cell',
    data: { video: '/img/examples/cell-tour.mp4', interactions: [
      { id: 'a', time: 3, kind: 'info', title: 'Look closely', text: '<p>We are zooming in on the <strong>nucleus</strong> — the purple circle in the middle.</p>', options: [] },
      { id: 'b', time: 7, kind: 'question', title: 'Quick check', text: '<p>What does the nucleus contain?</p>', options: [{ text: 'DNA', correct: true }, { text: 'Water only', correct: false }] },
    ] },
  }),

  editor(data, ctx) {
    return h('div', {},
      mediaField('Video', data, 'video', ctx.onChange, ctx, { video: true, accept: 'video/mp4,video/webm', help: 'Paste a YouTube link or upload an MP4/WebM file.' }),
      listEditor({
        items: data.interactions, label: 'Interactions', addText: 'Add interaction', onChange: ctx.onChange,
        empty: 'Add a question or note that appears at a moment in the video.',
        itemLabel: (it) => `${fmtTime(it.time)} · ${it.kind === 'info' ? 'Note' : 'Question'}${it.title ? ` · ${it.title}` : ''}`,
        create: () => ({ id: rid(), time: (data.interactions.at(-1)?.time || 0) + 30, kind: 'question', title: '', text: '', options: [{ text: '', correct: true }, { text: '', correct: false }] }),
        renderItem: (it, i, changed) => {
          const kindHost = h('div');
          const drawKind = () => kindHost.replaceChildren(
            it.kind === 'info'
              ? richField('Message', it, 'text', changed, { placeholder: 'What should learners read at this moment?' })
              : h('div', {}, richField('Question', it, 'text', changed, { compact: true, placeholder: 'Type your question…' }), optionsEditor(it, changed)));
          drawKind();
          const timeObj = { t: fmtTime(it.time) };
          return h('div', {},
            h('div', { class: 'field-row' },
              textField('Time (m:ss)', timeObj, 't', () => { it.time = parseTime(timeObj.t); changed(); }, { placeholder: '1:30' }),
              selectField('Type', it, 'kind', [['question', 'Question'], ['info', 'Note / information']], changed, { after: drawKind })),
            textField('Title (optional)', it, 'title', changed),
            kindHost);
        },
      }));
  },

  render(data, ctx) {
    if (!safeUrl(data.video) && !ytId(data.video)) return emptyState('type-video', 'Add a video link or upload a video to get started.');
    const items = (data.interactions || []).slice().sort((a, b) => a.time - b.time);
    const graded = items.filter((i) => i.kind !== 'info' && i.options?.some((o) => o.correct));
    const done = new Map();
    const wrap = h('div', { class: 'rs-video-wrap' });
    const player = makePlayer(data.video, wrap);
    const chips = h('div', { class: 'rs-timeline' });
    const score = h('span', { class: 'rs-score' });
    let open = false;
    let lastT = 0;

    const drawChips = () => {
      chips.replaceChildren(...items.map((it) => h('button', { class: `rs-chip ${done.has(it) ? 'done' : ''}`, type: 'button', onclick: () => { player.seek(Math.max(0, it.time - 0.5)); lastT = it.time - 1; } },
        icon(done.has(it) ? 'check' : it.kind === 'info' ? 'info' : 'help', { size: 14 }), `${fmtTime(it.time)} ${it.title || (it.kind === 'info' ? 'Note' : 'Question')}`)));
      const s = [...done.values()].filter((v) => v === true).length;
      score.textContent = `${s} / ${graded.length}`;
      score.classList.toggle('hidden', !graded.length);
    };

    const show = (it) => {
      open = true; player.pause();
      const card = h('div', { class: 'rs-overlay-card', role: 'dialog', 'aria-label': it.title || 'Interaction' });
      const overlay = h('div', { class: 'rs-overlay' }, card);
      const resume = () => { overlay.remove(); open = false; drawChips(); player.play(); };
      if (it.title) card.append(h('h3', {}, it.title));
      if (it.kind === 'info') {
        card.append(richBlock(it.text), h('div', { class: 'rs-actions' }, h('button', { class: 'btn primary rs-accent-btn', type: 'button', onclick: () => { done.set(it, 'seen'); resume(); } }, icon('play', { size: 14 }), h('span', {}, 'Continue'))));
      } else {
        const q = choiceQuestion(it);
        const fb = h('div');
        const go = h('button', { class: 'btn primary rs-accent-btn hidden', type: 'button', onclick: resume }, icon('play', { size: 14 }), h('span', {}, 'Continue'));
        const check = h('button', { class: 'btn primary rs-accent-btn', type: 'button', onclick: () => {
          const ok = q.check(); if (ok === null) return;
          done.set(it, ok); check.remove(); go.classList.remove('hidden'); fb.append(feedback(ok)); drawChips();
          if (graded.every((g) => done.has(g))) ctx.report?.([...done.values()].filter((v) => v === true).length, graded.length);
        } }, icon('check', { size: 15 }), h('span', {}, 'Check'));
        card.append(q.el, fb, h('div', { class: 'rs-actions' }, check, go));
      }
      wrap.append(overlay);
      card.querySelector('button')?.focus();
    };

    const timer = setInterval(() => {
      if (!wrap.isConnected) { clearInterval(timer); return; } // preview was re-rendered
      if (open) return;
      const t = player.time();
      const hit = items.find((it) => !done.has(it) && it.time > lastT - 0.01 && it.time <= t && t - it.time < 2);
      lastT = t;
      if (hit) show(hit);
    }, 250);
    drawChips();
    return h('div', {}, wrap, items.length > 0 && h('div', { class: 'rs-actions' }, h('span', { class: 'rs-status' }, 'Jump to:'), score), chips);
  },
};
