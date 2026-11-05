// Server-side knowledge of each content type: default embed size and maximum score
// (used to create a graded ReachLMS assignment via the AGS lineItem).
const marked = (text = '') => (String(text).match(/\*[^*\n]+\*/g) || []).length;
const questions = (list = []) => list.filter((q) => q && Array.isArray(q.options) && q.options.some((o) => o.correct)).length;

export const TYPES = {
  hotspots:     { embedSize: { width: 800, height: 560 }, maxScore: () => 0 },
  presentation: { embedSize: { width: 900, height: 600 }, maxScore: (d) => questions((d.slides || []).map((s) => s.question).filter(Boolean)) },
  video:        { embedSize: { width: 900, height: 600 }, maxScore: (d) => questions((d.interactions || []).filter((i) => i.kind === 'question')) },
  quiz:         { embedSize: { width: 800, height: 620 }, maxScore: (d) => questions(d.questions) },
  dragdrop:     { embedSize: { width: 900, height: 640 }, maxScore: (d) => (d.items || []).filter((i) => i.zoneId).length },
  blanks:       { embedSize: { width: 800, height: 440 }, maxScore: (d) => marked(d.text) },
  dragwords:    { embedSize: { width: 800, height: 460 }, maxScore: (d) => marked(d.text) },
  cards:        { embedSize: { width: 720, height: 480 }, maxScore: () => 0 },
  accordion:    { embedSize: { width: 800, height: 460 }, maxScore: () => 0 },
  markwords:    { embedSize: { width: 800, height: 400 }, maxScore: (d) => marked(d.text) },
};

export const isType = (t) => Object.prototype.hasOwnProperty.call(TYPES, t);
