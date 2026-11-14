import { h, textField, selectField, mediaField, listEditor, safeUrl, richField, richBlock, isBlank, emptyState, rid } from '../util.js';
import { icon } from '../icons.js';

export default {
  id: 'personality',
  name: 'Personality Quiz',
  icon: 'type-personality',
  graded: false,
  category: 'games',
  tagline: '"Which one are you?" — answers add up to a result, not a score.',
  about: {
    summary: 'A quiz with no right or wrong answers. Each answer points towards one of your results (personalities, learning styles, careers, characters). At the end, learners see the result their answers pointed to most.',
    uses: ['"Which scientist / character / career are you?" engagement activities', 'Learning-style or interest surveys', 'Recommending a pathway, resource or next step', 'Ice-breakers at the start of a course'],
    learners: 'Learners answer each question by clicking an option, then see their result with its description and picture. They can retake it.',
    tip: 'Give every result roughly the same number of answers across the quiz, so all results are reachable.',
  },
  defaults: () => ({ intro: '', results: [{ id: rid(), name: '', description: '', image: '' }, { id: rid(), name: '', description: '', image: '' }], questions: [{ text: '', image: '', answers: [{ text: '', result: '' }, { text: '', result: '' }] }] }),
  example: () => ({
    title: 'Which part of the cell are you?',
    data: { intro: '<p>Answer three questions to find out!</p>',
      results: [
        { id: 'n', name: 'The Nucleus', description: '<p>You\'re a natural <strong>leader</strong> — organised, in control and full of good instructions.</p>', image: '' },
        { id: 'm', name: 'The Mitochondrion', description: '<p>You\'re the <strong>energiser</strong> — always on the go and powering everyone around you.</p>', image: '' },
        { id: 'w', name: 'The Cell Wall', description: '<p>You\'re the <strong>protector</strong> — dependable, strong and supportive.</p>', image: '' },
      ],
      questions: [
        { text: 'In a group project you usually…', image: '', answers: [{ text: 'Make the plan', result: 'n' }, { text: 'Get everyone moving', result: 'm' }, { text: 'Make sure nothing goes wrong', result: 'w' }] },
        { text: 'Your ideal weekend is…', image: '', answers: [{ text: 'Organising something big', result: 'n' }, { text: 'Sport and adventure', result: 'm' }, { text: 'Relaxing with close friends', result: 'w' }] },
        { text: 'Friends describe you as…', image: '', answers: [{ text: 'Wise', result: 'n' }, { text: 'Energetic', result: 'm' }, { text: 'Loyal', result: 'w' }] },
      ] },
  }),

  editor(data, ctx) {
    const qHost = h('div');
    const resultOptions = () => [['', '— choose a result —'], ...data.results.map((r, i) => [r.id, r.name || `Result ${i + 1}`])];
    const drawQs = () => qHost.replaceChildren(listEditor({
      items: data.questions, label: 'Questions', addText: 'Add question', min: 1, onChange: ctx.onChange,
      itemLabel: (q, i) => `${i + 1}. ${q.text || 'Untitled question'}`,
      create: () => ({ text: '', image: '', answers: [{ text: '', result: '' }, { text: '', result: '' }] }),
      renderItem: (q, i, changed) => h('div', {},
        textField('Question', q, 'text', changed),
        mediaField('Picture (optional)', q, 'image', changed, ctx),
        listEditor({
          items: q.answers, label: 'Answers', addText: 'Add answer', min: 2, onChange: changed,
          itemLabel: (a, j) => `${a.text || `Answer ${j + 1}`} → ${data.results.find((r) => r.id === a.result)?.name || '?'}`,
          create: () => ({ text: '', result: '' }),
          renderItem: (a, j, ch) => h('div', { class: 'field-row' }, textField('Answer', a, 'text', ch), selectField('Points to', a, 'result', resultOptions(), ch)),
        })),
    }));
    drawQs();
    return h('div', {},
      richField('Introduction (optional)', data, 'intro', ctx.onChange, { compact: true }),
      listEditor({
        items: data.results, label: 'Possible results', addText: 'Add result', min: 2, onChange: () => { ctx.onChange(); drawQs(); },
        itemLabel: (r, i) => r.name || `Result ${i + 1}`,
        create: () => ({ id: rid(), name: '', description: '', image: '' }),
        renderItem: (r, i, changed) => h('div', {}, textField('Name', r, 'name', () => { changed(); drawQs(); }), richField('Description', r, 'description', changed, { compact: true }), mediaField('Picture (optional)', r, 'image', changed, ctx)),
      }),
      qHost);
  },

  render(data) {
    const results = (data.results || []).filter((r) => r.name?.trim());
    const questions = (data.questions || []).filter((q) => q.text?.trim() && q.answers?.some((a) => a.text?.trim() && a.result));
    if (results.length < 2 || !questions.length) return emptyState('type-personality', 'Add at least two results and one question whose answers point to them.');
    const root = h('div', { class: 'rs-personality' });
    let idx; const tally = new Map();
    const start = () => { idx = 0; tally.clear(); draw(); };
    const draw = () => {
      if (idx >= questions.length) {
        const best = results.reduce((a, r) => ((tally.get(r.id) || 0) > (tally.get(a.id) || 0) ? r : a), results[0]);
        root.replaceChildren(h('div', { class: 'rs-persona' }, h('p', { class: 'rs-status' }, 'Your result'),
          safeUrl(best.image) && h('img', { src: safeUrl(best.image), alt: '' }),
          h('h3', {}, best.name), !isBlank(best.description) && richBlock(best.description),
          h('button', { class: 'btn', type: 'button', onclick: start }, icon('restore', { size: 16 }), h('span', {}, 'Take it again'))));
        return;
      }
      const q = questions[idx];
      root.replaceChildren(...[
        idx === 0 && !isBlank(data.intro) && richBlock(data.intro, 'rs-instructions'),
        h('div', { class: 'rs-progress' }, h('div', { style: { width: `${(idx / questions.length) * 100}%` } })),
        h('p', { class: 'rs-status' }, `Question ${idx + 1} of ${questions.length}`),
        h('div', { class: 'rs-question-text' }, q.text),
        safeUrl(q.image) && h('img', { class: 'rs-question-img', src: safeUrl(q.image), alt: '' }),
        h('div', { class: 'rs-options persona-opts' }, q.answers.filter((a) => a.text?.trim()).map((a) => h('button', { class: 'rs-option', type: 'button', onclick: () => { tally.set(a.result, (tally.get(a.result) || 0) + 1); idx++; draw(); } }, h('span', {}, a.text)))),
      ].filter(Boolean));
    };
    start();
    return root;
  },
};
