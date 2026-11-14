// ReachQuizzes quiz content ("rqquiz"): a list of questions, each worth some points.
//   choice kinds (mc / ma / tf) and numeric are marked on the server; their answer keys are never
//   sent to students. Interactive kinds (drag and drop, matching, ordering…) reuse ReachStudio
//   activity types: the page reports how much of each one is right and the server turns that into
//   points (partial credit, or all-or-nothing). Essays are graded by the lecturer in SpeedGrader.
const plain = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/&(nbsp|#160);/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

export const CHOICE = ['mc', 'ma', 'tf'];
export const INTERACTIVE = ['blanks', 'dragwords', 'markwords', 'matching', 'order', 'categorize', 'dragdrop', 'hotspot', 'summary'];
export const KINDS = [...CHOICE, 'numeric', ...INTERACTIVE, 'essay'];

const pts = (q) => Math.max(0, Math.min(1000, Number(q.points) || 0));
export const questionsOf = (data) => (Array.isArray(data?.questions) ? data.questions.filter((q) => q && KINDS.includes(q.kind)) : []);
export const totalPoints = (data) => Math.round(questionsOf(data).reduce((n, q) => n + pts(q), 0) * 100) / 100;
export const hasManual = (data) => questionsOf(data).some((q) => q.kind === 'essay');

/** What a student's browser may see: no correct flags, no numeric answers, no answer-revealing feedback. */
export function studentData(data) {
  return {
    ...data,
    questions: questionsOf(data).map((q) => {
      if (CHOICE.includes(q.kind)) {
        return { ...q, data: { text: q.data?.text || '', image: q.data?.image || '', multi: q.kind === 'ma', options: (q.data?.options || []).map((o) => ({ text: o.text })) } };
      }
      if (q.kind === 'numeric') return { ...q, data: { text: q.data?.text || '', image: q.data?.image || '', unit: q.data?.unit || '' } };
      return q;
    }),
  };
}

const describeChoice = (q, picked) => {
  const opts = q.data?.options || [];
  return { answer: picked.length ? picked.map((j) => opts[j]?.text ?? '?').join('; ') : '(no answer)', correct: opts.map((o, j) => (o.correct ? o.text : null)).filter((x) => x !== null).join('; ') };
};

/**
 * Marks a submitted attempt. responses: [{ key: question id, picked?: [i…], value?: string,
 * raw?: number, rawMax?: number, answer?: string }]. Returns { score, max, review, responses }.
 */
export function markQuiz(data, responses = []) {
  const byKey = new Map((Array.isArray(responses) ? responses : []).map((r) => [String(r?.key), r]));
  let score = 0; let review = false;
  const out = [];
  questionsOf(data).forEach((q, i) => {
    const p = pts(q);
    const r = byKey.get(String(q.id)) || {};
    const label = `${i + 1}. ${plain(q.data?.text || q.data?.task || q.data?.instructions || q.data?.html || q.title || '').slice(0, 300) || 'Question'}`;
    let earned = 0; let ok = null; let answer = String(r.answer ?? '').slice(0, 2000); let correct = '';
    if (CHOICE.includes(q.kind)) {
      const opts = q.data?.options || [];
      const picked = [...new Set((Array.isArray(r.picked) ? r.picked : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < opts.length))];
      const right = opts.map((o, j) => (o.correct ? j : -1)).filter((j) => j >= 0);
      ({ answer, correct } = describeChoice(q, picked));
      if (q.kind === 'ma' && q.partial !== false && right.length) {
        // Multiple answer: each right choice earns its share; each wrong choice takes one away.
        const hits = picked.filter((j) => right.includes(j)).length; const misses = picked.length - hits;
        const frac = Math.max(0, (hits - misses) / right.length);
        earned = p * frac; ok = frac === 1 ? true : frac === 0 ? false : null;
      } else {
        ok = picked.length === right.length && picked.every((j) => right.includes(j)) && right.length > 0;
        earned = ok ? p : 0;
      }
    } else if (q.kind === 'numeric') {
      const v = Number(String(r.value ?? '').replace(',', '.').trim());
      const target = Number(q.data?.answer); const margin = Math.abs(Number(q.data?.margin) || 0);
      answer = String(r.value ?? '').trim() || '(no answer)';
      correct = `${q.data?.answer}${margin ? ` ± ${margin}` : ''}${q.data?.unit ? ` ${q.data.unit}` : ''}`;
      ok = String(r.value ?? '').trim() !== '' && Number.isFinite(v) && Number.isFinite(target) && Math.abs(v - target) <= margin + 1e-9;
      earned = ok ? p : 0;
    } else if (q.kind === 'essay') {
      review = true; ok = null; correct = '';
      answer = answer || '(no answer)';
    } else {
      const max = Math.max(0, Number(r.rawMax) || 0);
      const raw = Math.max(0, Math.min(max, Number(r.raw) || 0));
      const frac = max ? raw / max : 0;
      earned = q.partial === false ? (frac === 1 ? p : 0) : p * frac;
      ok = max ? (frac === 1 ? true : frac === 0 ? false : null) : false;
      answer = answer || (max ? `${raw} of ${max} parts right` : '(not answered)');
    }
    earned = Math.round(earned * 100) / 100;
    score += earned;
    out.push({ key: String(q.id), question: label, answer, correct, ok, note: q.kind === 'essay' ? `${p} pts — grade in SpeedGrader` : `${earned} / ${p} pts` });
  });
  return { score: Math.round(score * 100) / 100, max: totalPoints(data), review, responses: out };
}
