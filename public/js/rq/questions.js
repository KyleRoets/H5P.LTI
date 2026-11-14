// ReachQuizzes question kinds: how each is edited (teacher) and answered (student).
// Choice and numeric answers are marked on the server (their answer keys never reach students).
// Interactive kinds reuse ReachStudio activities; their own "Check" runs when the quiz is
// submitted, so students see no marking while answering.
import { h, textField, richField, mediaField, optionsEditor, choiceQuestion, richBlock, isBlank, htmlToText, safeUrl } from '../util.js';
import { TYPES } from '../types/index.js';

const T = (id) => TYPES[id];
const choice = (correct) => ({ text: '', image: '', options: correct.map((c) => ({ text: '', correct: c })) });

// kind → { name, icon, blurb, type (ReachStudio type for interactive kinds), defaults() }
export const KINDS = {
  mc: { name: 'Multiple choice', icon: 'type-quiz', blurb: 'One correct answer', defaults: () => choice([true, false, false, false]) },
  ma: { name: 'Multiple answer', icon: 'list', blurb: 'Select all that apply · partial credit', defaults: () => choice([true, true, false, false]) },
  tf: { name: 'True / False', icon: 'check', blurb: 'Two options', defaults: () => ({ text: '', image: '', options: [{ text: 'True', correct: true }, { text: 'False', correct: false }] }) },
  numeric: { name: 'Numeric', icon: 'type-arithmetic', blurb: 'A number, with an optional margin', defaults: () => ({ text: '', image: '', answer: '', margin: 0, unit: '' }) },
  blanks: { name: 'Fill in the blanks', icon: 'type-blanks', type: 'blanks', blurb: 'Type the missing words' },
  dragwords: { name: 'Drag the words', icon: 'type-dragwords', type: 'dragwords', blurb: 'Drag words into gaps' },
  categorize: { name: 'Categorization', icon: 'type-dragdrop', type: 'dragdrop', blurb: 'Sort items into categories', defaults: () => ({ ...T('dragdrop').defaults(), image: '', showZoneLabels: true }) },
  dragdrop: { name: 'Drag and drop on an image', icon: 'type-dragdrop', type: 'dragdrop', blurb: 'Labels onto areas of a picture' },
  matching: { name: 'Matching', icon: 'type-matching', type: 'matching', blurb: 'Pair items up' },
  order: { name: 'Ordering', icon: 'type-order', type: 'order', blurb: 'Put items in the right order' },
  hotspot: { name: 'Hot spot', icon: 'type-findhotspot', type: 'findhotspot', blurb: 'Click the right area of an image' },
  markwords: { name: 'Mark the words', icon: 'type-markwords', type: 'markwords', blurb: 'Select words in a text' },
  summary: { name: 'Pick the true statement', icon: 'type-summary', type: 'summary', blurb: 'Choose correct statements in sets' },
  essay: { name: 'Essay', icon: 'type-essay', type: 'essay', blurb: 'Written answer · graded by you', defaults: () => ({ ...T('essay').defaults(), keywords: [] }) },
};
export const KIND_ORDER = ['mc', 'ma', 'tf', 'numeric', 'blanks', 'dragwords', 'categorize', 'dragdrop', 'matching', 'order', 'hotspot', 'markwords', 'summary', 'essay'];
export const newQuestion = (kind) => ({ id: Math.random().toString(36).slice(2, 10), kind, points: kind === 'essay' ? 5 : 1, partial: true, data: (KINDS[kind].defaults || T(KINDS[kind].type).defaults)() });
export const questionText = (q) => htmlToText(q.data?.text || q.data?.task || q.data?.instructions || q.data?.html || q.data?.intro || '') || KINDS[q.kind]?.name || 'Question';

/** Teacher: the editor for one question's content. */
export function questionEditor(q, ctx) {
  const k = KINDS[q.kind];
  if (['mc', 'ma', 'tf'].includes(q.kind)) {
    return h('div', {},
      richField('Question', q.data, 'text', ctx.onChange, { compact: true, placeholder: 'Type the question…' }),
      mediaField('Picture (optional)', q.data, 'image', ctx.onChange, ctx),
      optionsEditor(q.data, ctx.onChange, { multi: q.kind === 'ma', fixed: q.kind === 'tf' }));
  }
  if (q.kind === 'numeric') {
    return h('div', {},
      richField('Question', q.data, 'text', ctx.onChange, { compact: true, placeholder: 'e.g. How many chromosomes does a human cell have?' }),
      mediaField('Picture (optional)', q.data, 'image', ctx.onChange, ctx),
      h('div', { class: 'field-row' },
        textField('Correct answer', q.data, 'answer', ctx.onChange, { type: 'number', step: 'any' }),
        textField('Margin (±)', q.data, 'margin', ctx.onChange, { type: 'number', step: 'any', min: 0, help: '0 = exact' }),
        textField('Unit (optional)', q.data, 'unit', ctx.onChange, { placeholder: 'e.g. cm' })));
  }
  return T(k.type).editor(q.data, ctx);
}

/**
 * Student: one question, answered without marking. Returns { el, collect() } — collect() runs
 * the activity's own check (marking stays hidden) and gives the answer for the server.
 */
export function questionView(q) {
  const k = KINDS[q.kind];
  if (['mc', 'ma', 'tf'].includes(q.kind)) {
    const cq = choiceQuestion({ ...q.data, _secure: true, multi: q.kind === 'ma' || !!q.data.multi });
    return { el: cq.el, collect: () => { const d = cq.describe(); return { picked: d.picked, answer: d.answer }; } };
  }
  if (q.kind === 'numeric') {
    const input = h('input', { type: 'text', inputmode: 'decimal', class: 'rq-numeric', 'aria-label': 'Your answer', placeholder: 'Your answer' });
    const el = h('div', { class: 'rs-question' },
      !isBlank(q.data.text) && richBlock(q.data.text, 'rs-question-text'),
      safeUrl(q.data.image) && h('img', { class: 'rs-question-img', src: safeUrl(q.data.image), alt: '' }),
      h('div', { class: 'rq-numeric-row' }, input, q.data.unit && h('span', { class: 'rq-unit' }, q.data.unit)));
    return { el, collect: () => ({ value: input.value.trim(), answer: input.value.trim() }) };
  }
  let result = null;
  const el = T(k.type).render(q.data, { grading: { mode: q.kind === 'essay' ? 'manual' : 'auto', showFeedback: false }, report: (s, m) => { result = { raw: s, rawMax: m }; } });
  return {
    el,
    collect: () => {
      if (q.kind === 'essay') { const v = el.querySelector?.('textarea')?.value || ''; return { answer: v.slice(0, 4000) }; }
      if (!result) {
        // Run the activity's own check (its marking is hidden while the quiz is taken).
        const btn = [...el.querySelectorAll('.rs-actions button')].find((b) => !b.classList.contains('hidden') && /^(Check|Done|Save answer)$/.test(b.textContent.trim()));
        btn?.click();
      }
      return result ? { raw: result.raw, rawMax: result.rawMax } : { raw: 0, rawMax: 1, answer: '(not answered)' };
    },
  };
}
