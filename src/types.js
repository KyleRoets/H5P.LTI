// Server-side knowledge of each content type: default embed size and maximum score
// (used to create a graded ReachLMS assignment via the AGS lineItem).

// Answers are <mark> elements in rich text (older content used *asterisks* in plain text).
const marks = (d) => (d.html !== undefined
  ? (String(d.html).match(/<mark[\s>]/gi) || []).length
  : (String(d.text || '').match(/\*[^*\n]+\*/g) || []).length);
const plain = (v) => String(v || '').replace(/<[^>]*>/g, '').trim();
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
};

/** Embed iframe size: the author's chosen width, height scaled from the type default. */
export function embedSize(type, data) {
  const def = TYPES[type]?.embedSize || { width: 800, height: 520 };
  const w = [560, 800, 1000].includes(Number(data?.style?.width)) ? Number(data.style.width) : def.width;
  return { width: w, height: Math.round((def.height * w) / def.width) };
}

export const isType = (t) => Object.prototype.hasOwnProperty.call(TYPES, t);
