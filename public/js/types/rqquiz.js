// A ReachQuizzes course quiz as students take it: all questions on one page, no marking shown;
// answers are collected when the student presses Submit and marked on the server.
import { h, richBlock, isBlank, emptyState } from '../util.js';
import { icon } from '../icons.js';
import { KINDS, questionView } from '../rq/questions.js';
import { seededShuffle } from './_shared.js';

export default {
  id: 'rqquiz',
  name: 'Course quiz',
  icon: 'type-quiz',
  category: 'questions',
  graded: true,
  hidden: true,
  tagline: 'A ReachQuizzes course quiz.',
  about: { summary: 'Created in Quizzes+.', uses: [], learners: '', tip: '' },
  defaults: () => ({ description: '', questions: [] }),
  editor: () => h('p', { class: 'help' }, 'Edit this quiz from Quizzes+ in its course.'),

  render(data, ctx) {
    let qs = (data.questions || []).filter((q) => KINDS[q.kind]);
    if (!qs.length) return emptyState('type-quiz', 'This quiz has no questions yet.');
    if (data.settings?.shuffleQuestions) qs = seededShuffle(qs, Math.random);
    const views = [];
    const root = h('div', { class: 'rq-quiz' },
      !isBlank(data.description) && richBlock(data.description, 'rs-instructions rq-desc'),
      ...qs.map((q, i) => {
        const v = questionView(q);
        views.push([q, v]);
        return h('section', { class: `rq-q kind-${q.kind}`, 'aria-label': `Question ${i + 1}` },
          h('header', { class: 'rq-q-head' }, h('span', { class: 'rq-q-n' }, `Question ${i + 1}`), h('span', { class: 'rq-q-pts' }, `${q.points} pt${Number(q.points) === 1 ? '' : 's'}`),
            q.kind === 'essay' && h('span', { class: 'rq-q-tag' }, icon('edit', { size: 12 }), 'graded by your teacher')),
          v.el);
      }));
    // Called by the assignment player just before Submit: gather every answer for the server.
    ctx.onBeforeSubmit?.(() => {
      for (const [q, v] of views) ctx.record?.({ key: String(q.id), ...v.collect() });
      ctx.report?.(0, 1);
    });
    ctx.report?.(0, 1); // lets the student submit at any time
    return root;
  },
};
