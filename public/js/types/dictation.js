import { h, textField, selectField, mediaField, listEditor, richField, richBlock, isBlank, checkField, safeUrl, emptyState } from '../util.js';
import { icon } from '../icons.js';
import { normalize } from './_shared.js';

const LANGS = [['en-GB', 'English (UK)'], ['en-US', 'English (US)'], ['en-ZA', 'English (South Africa)'], ['af-ZA', 'Afrikaans'], ['fr-FR', 'French'], ['de-DE', 'German'], ['es-ES', 'Spanish'], ['pt-PT', 'Portuguese'], ['nl-NL', 'Dutch'], ['it-IT', 'Italian'], ['zu-ZA', 'isiZulu']];
const words = (s, keepPunct) => String(s || '').trim().split(/\s+/).filter(Boolean).map((w) => (keepPunct ? w.toLowerCase() : normalize(w))).filter(Boolean);

/** Longest-common-subsequence alignment of target words vs typed words. */
function align(target, typed) {
  const n = target.length; const m = typed.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = target[i] === typed[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0; let j = 0;
  while (i < n && j < m) {
    if (target[i] === typed[j]) { out.push({ t: 'ok', w: target[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: 'missing', w: target[i] }); i++; }
    else { out.push({ t: 'extra', w: typed[j] }); j++; }
  }
  while (i < n) out.push({ t: 'missing', w: target[i++] });
  while (j < m) out.push({ t: 'extra', w: typed[j++] });
  return { matches: dp[0][0], parts: out };
}

// Voices load asynchronously in some browsers; warm the list up early.
if ('speechSynthesis' in window) { speechSynthesis.getVoices(); speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices()); }

// Pick the most natural-sounding voice the device has for the language. Neural/"natural"
// voices (Edge, Windows 11, Chrome's Google voices, Apple's enhanced/premium voices) sound far
// better than the robotic defaults, so they are preferred.
const GOOD = [/natural/i, /neural/i, /premium/i, /enhanced/i, /^google/i, /siri/i,
  /\b(sonia|libby|ryan|aria|jenny|guy|emma|brian|ava|andrew|serena|daniel|kate|oliver|samantha|karen|moira|tessa|martha|arthur)\b/i];
const BAD = [/compact/i, /espeak/i, /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy)\b/i];
export function bestVoice(lang = 'en-GB') {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const want = lang.toLowerCase(); const base = want.split('-')[0];
  const score = (v) => {
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    let s = l === want ? 100 : l.split('-')[0] === base ? 60 : -1000;
    GOOD.forEach((r, i) => { if (r.test(v.name)) s += 40 - i * 2; });
    if (BAD.some((r) => r.test(v.name))) s -= 80;
    if (!v.localService) s += 5; // online voices are usually the higher-quality ones
    return s;
  };
  return voices.slice().sort((a, b) => score(b) - score(a))[0];
}

function speak(text, lang, slow) {
  if (!('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang || 'en-GB';
  const v = bestVoice(u.lang); if (v) u.voice = v;
  u.rate = slow ? 0.7 : 0.95; u.pitch = 1;
  speechSynthesis.speak(u);
  return true;
}

export default {
  id: 'dictation',
  name: 'Dictation',
  icon: 'type-dictation',
  graded: true,
  category: 'questions',
  tagline: 'Learners listen to sentences and type what they hear.',
  about: {
    summary: 'Learners listen to a sentence and type it. You can upload a recording for each sentence — or leave it empty and ReachStudio reads the sentence aloud with the browser\'s built-in voice. Answers are compared word by word.',
    uses: ['Language learning: listening and spelling', 'Spelling tests and key vocabulary', 'Note-taking and listening practice', 'Accessibility-friendly listening tasks'],
    learners: 'Learners press Play (and Slow if needed), type the sentence, then press Check. They see which words were right, wrong or missing; each correct word earns a point.',
    tip: 'Keep sentences short (5–12 words). If you rely on the built-in voice, pick the right language so pronunciation is correct.',
  },
  defaults: () => ({ task: '', lang: 'en-GB', strictPunctuation: false, sentences: [{ text: '', audio: '' }] }),
  example: () => ({
    title: 'Science spelling',
    data: { task: '<p>Listen and type each sentence.</p>', lang: 'en-GB', strictPunctuation: false, sentences: [
      { text: 'The nucleus controls the cell.', audio: '' },
      { text: 'Plants need sunlight to make food.', audio: '' },
    ] },
  }),

  editor(data, ctx) {
    return h('div', {},
      richField('Task', data, 'task', ctx.onChange, { compact: true, placeholder: 'e.g. Listen and type what you hear.' }),
      listEditor({
        items: data.sentences, label: 'Sentences', addText: 'Add sentence', min: 1, onChange: ctx.onChange,
        itemLabel: (s, i) => `${i + 1}. ${s.text || 'Untitled sentence'}`,
        create: () => ({ text: '', audio: '' }),
        renderItem: (s, i, changed) => h('div', {},
          textField('Sentence (the correct answer)', s, 'text', changed),
          mediaField('Recording (optional)', s, 'audio', changed, ctx, { audio: true, accept: 'audio/mpeg', help: 'Upload an MP3. Without one, the sentence is read aloud by the learner\'s browser.' })),
      }),
      h('div', { class: 'section-title' }, 'Settings'),
      selectField('Language of the read-aloud voice', data, 'lang', LANGS, ctx.onChange),
      checkField('Punctuation and capitals must match', data, 'strictPunctuation', ctx.onChange));
  },

  render(data, ctx) {
    const sentences = (data.sentences || []).filter((s) => s.text?.trim());
    if (!sentences.length) return emptyState('type-dictation', 'Add a sentence to get started.');
    const strict = !!data.strictPunctuation;
    const rows = sentences.map((s, i) => {
      const url = safeUrl(s.audio);
      const audio = url && h('audio', { src: url, preload: 'none' });
      const play = (slow) => {
        if (audio) { audio.playbackRate = slow ? 0.7 : 1; audio.currentTime = 0; audio.play(); return; }
        if (!speak(s.text, data.lang, slow)) note.textContent = 'Your browser can\'t read text aloud — please ask your teacher for a recording.';
      };
      const note = h('span', { class: 'rs-status' });
      const input = h('input', { type: 'text', class: 'rs-dict-input', 'aria-label': `Sentence ${i + 1}`, autocomplete: 'off', spellcheck: 'false' });
      const result = h('div', { class: 'rs-dict-result' });
      return { s, input, result, el: h('div', { class: 'rs-dict-row' },
        h('div', { class: 'rs-dict-controls' }, h('span', { class: 'rs-dict-n' }, String(i + 1)),
          h('button', { class: 'btn sm primary rs-accent-btn', type: 'button', onclick: () => play(false) }, icon('play', { size: 13 }), h('span', {}, 'Play')),
          h('button', { class: 'btn sm', type: 'button', onclick: () => play(true) }, icon('clock', { size: 14 }), h('span', {}, 'Slow')), audio, note),
        input, result) };
    });
    const max = sentences.reduce((n, s) => n + words(s.text, strict).length, 0);
    const score = h('span', { class: 'rs-score hidden' });
    const check = h('button', { class: 'btn primary rs-accent-btn', type: 'button', onclick: () => {
      let total = 0;
      rows.forEach((r) => {
        const { matches, parts } = align(words(r.s.text, strict), words(r.input.value, strict));
        total += matches;
        r.input.readOnly = true;
        r.result.replaceChildren(h('div', { class: 'rs-dict-diff' }, parts.map((p) => h('span', { class: `w ${p.t}`, title: p.t === 'missing' ? 'Missing' : p.t === 'extra' ? 'Not in the sentence' : 'Correct' }, p.w))),
          h('div', { class: 'rs-dict-answer' }, icon('check', { size: 13 }), ` ${r.s.text}`));
      });
      score.textContent = `${total} / ${max} words`; score.classList.remove('hidden');
      check.classList.add('hidden'); retry.classList.remove('hidden');
      ctx.report?.(total, max);
    } }, icon('check', { size: 16 }), h('span', {}, 'Check'));
    const retry = h('button', { class: 'btn hidden rs-retry', type: 'button', onclick: () => { rows.forEach((r) => { r.input.readOnly = false; r.result.replaceChildren(); }); score.classList.add('hidden'); retry.classList.add('hidden'); check.classList.remove('hidden'); } }, icon('restore', { size: 16 }), h('span', {}, 'Try again'));
    return h('div', { class: 'rs-dict' }, !isBlank(data.task) && richBlock(data.task, 'rs-instructions rs-task'), rows.map((r) => r.el), h('div', { class: 'rs-actions' }, check, retry, score),
      h('p', { class: 'rs-legend' }, h('span', { class: 'w ok' }, 'correct'), ' ', h('span', { class: 'w missing' }, 'missing'), ' ', h('span', { class: 'w extra' }, 'not in the sentence')));
  },
};
