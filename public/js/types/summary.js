import { h, textField, listEditor, richField, richBlock, isBlank, emptyState, shuffle } from '../util.js';
import { icon } from '../icons.js';

export default {
  id: 'summary',
  name: 'Summary',
  icon: 'type-summary',
  graded: true,
  category: 'questions',
  tagline: 'Learners build a summary by picking the true statement from each set.',
  about: {
    summary: 'For each key point you write one correct statement and a few incorrect ones. Learners pick the correct statement from each set; as they go, the correct statements build up into a summary of the topic.',
    uses: ['Recap at the end of a lesson, video or reading', 'Checking the key takeaways of a topic', 'Spotting common misconceptions', 'Revision before a test'],
    learners: 'Learners see one set at a time and click the statement they think is true. Wrong picks are crossed out and they try again; the right one is added to the summary. Only first-try answers score.',
    tip: 'Make wrong statements plausible — common misunderstandings work well.',
  },
  defaults: () => ({ intro: '', sets: [{ correct: '', wrong: ['', ''] }] }),
  example: () => ({
    title: 'Cells: key points',
    data: { intro: '<p>Choose the correct statement in each set to build a summary of cells.</p>', sets: [
      { correct: 'All living things are made of cells.', wrong: ['Only animals are made of cells.', 'Cells are only found in plants.'] },
      { correct: 'The nucleus contains the cell\'s DNA.', wrong: ['The cell wall contains the DNA.', 'DNA floats outside the cell.'] },
      { correct: 'Plant cells have a cell wall; animal cells do not.', wrong: ['Animal cells have a cell wall; plant cells do not.', 'Neither has a cell wall.'] },
    ] },
  }),

  editor(data, ctx) {
    return h('div', {},
      richField('Introduction (optional)', data, 'intro', ctx.onChange, { compact: true }),
      listEditor({
        items: data.sets, label: 'Statement sets', addText: 'Add set', min: 1, onChange: ctx.onChange,
        itemLabel: (s, i) => `${i + 1}. ${s.correct || 'Untitled set'}`,
        create: () => ({ correct: '', wrong: ['', ''] }),
        renderItem: (s, i, changed) => {
          const wrongHost = h('div');
          const drawWrong = () => wrongHost.replaceChildren(listEditor({
            items: s.wrong, addText: 'Add wrong statement', min: 1, onChange: () => { changed(); },
            itemLabel: (w, j) => `Wrong ${j + 1}`,
            create: () => '',
            renderItem: (w, j) => { const o = { v: w }; return textField('', o, 'v', () => { s.wrong[j] = o.v; changed(); }, { placeholder: 'A plausible but wrong statement' }); },
          }));
          drawWrong();
          return h('div', {}, textField('Correct statement', s, 'correct', changed, { placeholder: 'The true statement (it goes into the summary)' }), h('div', { class: 'label' }, 'Wrong statements'), wrongHost);
        },
      }));
  },

  render(data, ctx) {
    const sets = (data.sets || []).filter((s) => s.correct?.trim() && s.wrong?.some((w) => w.trim()));
    if (!sets.length) return emptyState('type-summary', 'Add a set with a correct statement and at least one wrong one.');
    const root = h('div', { class: 'rs-summary' });
    let idx; let score; let firstTry;
    const start = () => { idx = 0; score = 0; firstTry = true; draw(); };
    const summaryList = h('ul', { class: 'rs-summary-list' });
    const draw = () => {
      root.replaceChildren();
      const bar = h('div', { class: 'rs-progress' }, h('div', { style: { width: `${(idx / sets.length) * 100}%` } }));
      if (idx === 0 && !isBlank(data.intro)) root.append(richBlock(data.intro, 'rs-instructions'));
      root.append(bar);
      if (idx >= sets.length) {
        root.append(h('div', { class: 'rs-result' }, h('div', { class: 'big' }, `${score} / ${sets.length}`), h('p', {}, 'Correct on the first try.'),
          h('button', { class: 'btn rs-retry', type: 'button', onclick: () => { summaryList.replaceChildren(); start(); } }, icon('restore', { size: 16 }), h('span', {}, 'Try again'))));
        root.append(h('h4', { class: 'rs-summary-h' }, 'Your summary'), summaryList);
        ctx.report?.(score, sets.length);
        return;
      }
      const s = sets[idx];
      const opts = shuffle([{ t: s.correct, ok: true }, ...s.wrong.filter((w) => w.trim()).map((t) => ({ t, ok: false }))]);
      firstTry = true;
      root.append(h('p', { class: 'rs-status' }, `Set ${idx + 1} of ${sets.length} — pick the correct statement`),
        h('div', { class: 'rs-options' }, opts.map((o) => {
          const b = h('button', { type: 'button', class: 'rs-option', onclick: () => {
            if (o.ok) {
              if (firstTry) score++;
              b.classList.add('correct');
              summaryList.append(h('li', {}, icon('check', { size: 15, stroke: 3 }), h('span', {}, s.correct)));
              setTimeout(() => { idx++; draw(); }, 550);
            } else { firstTry = false; b.classList.add('wrong'); b.disabled = true; }
          } }, h('span', { class: 'mark' }, icon('check', { size: 13, stroke: 3 })), h('span', {}, o.t));
          return b;
        })));
      if (summaryList.children.length) root.append(h('h4', { class: 'rs-summary-h' }, 'Summary so far'), summaryList);
    };
    start();
    return root;
  },
};
