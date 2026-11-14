// Exam mode for Quiz items: when the lecturer hides marking from students (assignments and
// ReachQuizzes), the browser gets the questions WITHOUT the answer key, the student's choices are
// sent back, and the score is worked out here. Nothing in the page reveals the correct answers.
const plain = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/&(nbsp|#160);/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const answerable = (q) => q && Array.isArray(q.options) && q.options.some((o) => o.correct) && (plain(q.text) || q.image);

export const isSecure = (type, grading) => type === 'quiz' && !!grading && grading.mode === 'auto' && !grading.showFeedback;

/** The quiz as the browser may see it: no `correct` flags (and no feedback text that could give it away). */
export function secureData(data) {
  return {
    ...data,
    questions: (data.questions || []).map((q) => (answerable(q) ? {
      ...q,
      _secure: true,
      multi: q.options.filter((o) => o.correct).length > 1,
      feedbackCorrect: '', feedbackWrong: '',
      options: q.options.map((o) => ({ text: o.text })),
    } : { ...q, options: (q.options || []).map((o) => ({ text: o.text })) })),
  };
}

/**
 * Marks the student's choices against the real answer key.
 * responses: [{ key: 'q<index>', picked: [optionIndex…] }] from the page (anything else is ignored).
 * Returns { score, max, responses } with the correct answers filled in for the lecturer.
 */
export function markSecure(data, responses = []) {
  const byKey = new Map((Array.isArray(responses) ? responses : []).map((r) => [String(r?.key), r]));
  let score = 0; let max = 0;
  const out = [];
  (data.questions || []).forEach((q, i) => {
    if (!answerable(q)) return;
    max++;
    const r = byKey.get(`q${i}`);
    const picked = new Set((Array.isArray(r?.picked) ? r.picked : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < q.options.length));
    const right = new Set(q.options.map((o, j) => (o.correct ? j : -1)).filter((j) => j >= 0));
    const ok = picked.size > 0 && picked.size === right.size && [...picked].every((j) => right.has(j));
    if (ok) score++;
    out.push({
      key: `q${i}`,
      question: plain(q.text) || `Question ${i + 1}`,
      answer: picked.size ? [...picked].map((j) => q.options[j].text).join('; ') : '(no answer)',
      correct: [...right].map((j) => q.options[j].text).join('; '),
      ok,
    });
  });
  return { score, max, responses: out };
}
