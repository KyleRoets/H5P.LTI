// Server-side knowledge of each content type: default embed size and maximum score
// (used to create a graded ReachLMS assignment via the AGS lineItem).

// Answers are <mark> elements in rich text (older content used *asterisks* in plain text).
const marks = (d) => (d.html !== undefined
  ? (String(d.html).match(/<mark[\s>]/gi) || []).length
  : (String(d.text || '').match(/\*[^*\n]+\*/g) || []).length);
const plain = (v) => String(v || '').replace(/<[^>]*>/g, '').replace(/&(nbsp|#160);/gi, ' ').trim();
const cleanWord = (w) => String(w || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
const questions = (list = []) => list.filter((q) => q && Array.isArray(q.options) && q.options.some((o) => o.correct)).length;

export const TYPES = {
  hotspots:     { embedSize: { width: 800, height: 560 }, maxScore: () => 0 },
  presentation: { embedSize: { width: 900, height: 600 }, maxScore: (d) => questions((d.slides || []).map((s) => s.question).filter(Boolean)) },
  video:        { embedSize: { width: 900, height: 600 }, maxScore: (d) => questions((d.interactions || []).filter((i) => i.kind !== 'info')) },
  quiz:         { embedSize: { width: 800, height: 620 }, maxScore: (d) => questions((d.questions || []).filter((q) => plain(q.text) || q.image)) },
  dragdrop:     { embedSize: { width: 900, height: 640 }, maxScore: (d) => (d.items || []).filter((i) => i.zoneId && String(i.text || '').trim()).length },
  blanks:       { embedSize: { width: 800, height: 440 }, maxScore: marks },
  dragwords:    { embedSize: { width: 800, height: 460 }, maxScore: marks },
  cards:        { embedSize: { width: 720, height: 480 }, maxScore: () => 0 },
  accordion:    { embedSize: { width: 800, height: 460 }, maxScore: () => 0 },
  markwords:    { embedSize: { width: 800, height: 400 }, maxScore: marks },
  findhotspot:  { embedSize: { width: 800, height: 600 }, maxScore: (d) => { const n = (d.zones || []).filter((z) => z.correct).length; return d.mode === 'all' ? n : Math.min(1, n); } },
  order:        { embedSize: { width: 800, height: 560 }, maxScore: (d) => { const n = (d.items || []).filter((i) => String(i.text || '').trim() || i.image).length; return n >= 2 ? n : 0; } },
  matching:     { embedSize: { width: 800, height: 560 }, maxScore: (d) => { const ok = (x) => x && (String(x.text || '').trim() || x.image); const n = (d.pairs || []).filter((p) => ok(p.a) && ok(p.b)).length; return n >= 2 ? n : 0; } },
  summary:      { embedSize: { width: 800, height: 520 }, maxScore: (d) => (d.sets || []).filter((x) => String(x.correct || '').trim() && (x.wrong || []).some((w) => String(w).trim())).length },
  essay:        { embedSize: { width: 800, height: 560 }, maxScore: (d) => (d.keywords || []).filter((k) => String(k.words || '').trim()).length },
  dictation:    { embedSize: { width: 800, height: 520 }, maxScore: (d) => (d.sentences || []).reduce((n, x) => n + String(x.text || '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length, 0) },
  arithmetic:   { embedSize: { width: 720, height: 440 }, maxScore: (d) => Math.max(1, Math.min(50, Number(d.count) || 10)) },
  memory:       { embedSize: { width: 800, height: 620 }, maxScore: () => 0 },
  crossword:    { embedSize: { width: 900, height: 640 }, maxScore: (d) => (d.words || []).filter((w) => cleanWord(w.answer).length >= 2 && String(w.clue || '').trim()).length },
  wordsearch:   { embedSize: { width: 800, height: 600 }, maxScore: (d) => new Set(String(d.words || '').split(/[,\n]/).map((w) => cleanWord(w).replace(/[0-9]/g, '')).filter((w) => w.length >= 2)).size },
  personality:  { embedSize: { width: 760, height: 520 }, maxScore: () => 0 },
  branching:    { embedSize: { width: 800, height: 560 }, maxScore: (d) => (d.scoring ? Math.max(0, ...(d.nodes || []).filter((n) => n.kind === 'end').map((n) => Number(n.score) || 0)) : 0) },
  book:         { embedSize: { width: 1000, height: 680 }, maxScore: (d) => (d.chapters || []).reduce((n, c) => n + (c.blocks || []).reduce((m, b) => m + (b.kind === 'activity' && b.type !== 'book' && TYPES[b.type] ? TYPES[b.type].maxScore(b.data || {}) : 0), 0), 0) },
  timeline:     { embedSize: { width: 900, height: 560 }, maxScore: () => 0 },
  slider:       { embedSize: { width: 800, height: 520 }, maxScore: () => 0 },
  beforeafter:  { embedSize: { width: 800, height: 540 }, maxScore: () => 0 },
  collage:      { embedSize: { width: 800, height: 520 }, maxScore: () => 0 },
  chart:        { embedSize: { width: 800, height: 520 }, maxScore: () => 0 },
  guess:        { embedSize: { width: 720, height: 520 }, maxScore: () => 0 },
};

/** Embed iframe size: the author's chosen width, height scaled from the type default. */
export function embedSize(type, data) {
  const def = TYPES[type]?.embedSize || { width: 800, height: 520 };
  const w = [560, 800, 1000].includes(Number(data?.style?.width)) ? Number(data.style.width) : def.width;
  return { width: w, height: Math.round((def.height * w) / def.width) };
}

export const isType = (t) => Object.prototype.hasOwnProperty.call(TYPES, t);
