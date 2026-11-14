import { h, textField, selectField, mediaField, listEditor, safeUrl, richField, richBlock, isBlank, checkField, emptyState, rid, htmlToText } from '../util.js';
import { icon } from '../icons.js';


export default {
  id: 'branching',
  name: 'Branching Scenario',
  icon: 'type-branching',
  graded: true,
  category: 'stories',
  tagline: 'A choose-your-path story where each decision leads somewhere different.',
  about: {
    summary: 'Build a story or simulation made of screens. Each screen has text and an image, and offers choices that lead to other screens. Paths end at endings you write — each ending can carry a score, so good decisions earn more.',
    uses: ['Decision-making and soft-skills practice (customer service, ethics, safety)', 'Case studies and simulations', 'Interactive stories and "what would you do?" scenarios', 'Troubleshooting guides and diagnostic trees'],
    learners: 'Learners read each screen and pick a choice. They follow their own path until they reach an ending, which explains the outcome. They can go back a step or start again.',
    tip: 'Sketch the paths on paper first. Keep each screen short and make the consequences of choices clear in the next screen.',
  },
  defaults: () => {
    const a = rid(); const e = rid();
    return { showBack: true, scoring: true, nodes: [
      { id: a, kind: 'screen', title: '', html: '', image: '', choices: [{ text: '', next: e }] },
      { id: e, kind: 'end', title: '', html: '', image: '', score: 1, choices: [] },
    ] };
  },
  example: () => ({
    title: 'Lab safety: what would you do?',
    data: { showBack: true, scoring: true, nodes: [
      { id: 's1', kind: 'screen', title: 'A spill in the lab', html: '<p>Your partner knocks over a beaker of an unknown liquid. It splashes onto the bench and the floor.</p>', image: '', choices: [{ text: 'Wipe it up with paper towels', next: 's2' }, { text: 'Tell the teacher straight away', next: 'e1' }] },
      { id: 's2', kind: 'screen', title: 'Your hands start to tingle', html: '<p>The liquid seems to be irritating your skin. What now?</p>', image: '', choices: [{ text: 'Keep cleaning — nearly done', next: 'e3' }, { text: 'Rinse your hands and tell the teacher', next: 'e2' }] },
      { id: 'e1', kind: 'end', title: 'Excellent decision', html: '<p>Unknown chemicals should always be reported first. Your teacher can identify it and clean it up safely.</p>', image: '', score: 3, choices: [] },
      { id: 'e2', kind: 'end', title: 'Good recovery', html: '<p>Rinsing and reporting was right — but telling the teacher <strong>before</strong> touching it would have been safer.</p>', image: '', score: 2, choices: [] },
      { id: 'e3', kind: 'end', title: 'Unsafe choice', html: '<p>Never keep handling an unknown chemical. Rinse with water and get help immediately.</p>', image: '', score: 0, choices: [] },
    ] },
  }),

  editor(data, ctx) {
    const warn = h('div');
    const targetOptions = (self) => [['', '— go to the default ending —'], ...data.nodes.filter((n) => n !== self).map((n, i) => [n.id, `${n.kind === 'end' ? 'Ending' : 'Screen'}: ${n.title || `#${data.nodes.indexOf(n) + 1}`}`])];
    const check = () => {
      const reach = new Set(); const stack = [data.nodes[0]?.id];
      while (stack.length) { const id = stack.pop(); if (!id || reach.has(id)) continue; reach.add(id); const n = data.nodes.find((x) => x.id === id); n?.choices?.forEach((c) => stack.push(c.next)); }
      const unreachable = data.nodes.filter((n) => !reach.has(n.id));
      warn.replaceChildren(unreachable.length ? h('div', { class: 'note warn' }, icon('info', { size: 16 }), h('span', {}, `Not reachable from the start: ${unreachable.map((n) => n.title || 'untitled').join(', ')}. Link to them from a choice, or delete them.`)) : '');
    };
    let redraw;
    const nodesEditor = () => listEditor({
      items: data.nodes, label: 'Screens and endings (the first one is the start)', addText: 'Add screen', min: 1, onChange: () => { ctx.onChange(); check(); },
      itemLabel: (n, i) => `${i === 0 ? 'START · ' : ''}${n.kind === 'end' ? 'Ending' : 'Screen'}: ${n.title || 'Untitled'}${n.kind === 'end' && data.scoring ? ` (${n.score || 0} pts)` : ''}`,
      create: () => ({ id: rid(), kind: 'screen', title: '', html: '', image: '', score: 0, choices: [{ text: '', next: '' }] }),
      renderItem: (n, i, changed) => {
        const choicesHost = h('div');
        const drawChoices = () => choicesHost.replaceChildren(n.kind === 'end'
          ? h('div', {}, data.scoring && textField('Score for this ending', n, 'score', changed, { type: 'number', min: 0 }))
          : listEditor({
            items: n.choices, label: 'Choices', addText: 'Add choice', min: 1, onChange: () => { changed(); check(); },
            itemLabel: (c, j) => `${c.text || `Choice ${j + 1}`} → ${data.nodes.find((x) => x.id === c.next)?.title || 'default ending'}`,
            create: () => ({ text: '', next: '' }),
            renderItem: (c, j, ch) => h('div', { class: 'field-row' }, textField('Choice text', c, 'text', ch), selectField('Leads to', c, 'next', targetOptions(n), () => { ch(); check(); })),
          }));
        drawChoices();
        return h('div', {},
          selectField('This is a…', n, 'kind', [['screen', 'Screen with choices'], ['end', 'Ending']], () => { if (n.kind === 'screen' && !n.choices.length) n.choices.push({ text: '', next: '' }); changed(); drawChoices(); check(); }),
          textField('Title', n, 'title', () => { changed(); }),
          richField('Text', n, 'html', changed, { placeholder: n.kind === 'end' ? 'What happened, and why?' : 'Describe the situation…' }),
          mediaField('Image (optional)', n, 'image', changed, ctx),
          choicesHost);
      },
    });
    const host = h('div', {}, nodesEditor());
    redraw = () => host.replaceChildren(nodesEditor());
    check();
    return h('div', {},
      h('p', { class: 'help top-help' }, 'Build screens with choices; each choice leads to another screen or an ending. Name your screens so they are easy to pick in "Leads to".'),
      warn, host,
      h('div', { class: 'section-title' }, 'Settings'),
      checkField('Let learners go back a step', data, 'showBack', ctx.onChange),
      checkField('Give a score at each ending (sends a grade when used as an assignment)', data, 'scoring', () => { ctx.onChange(); redraw(); }));
  },

  render(data, ctx) {
    const nodes = data.nodes || [];
    if (!nodes.length || (!nodes[0].title && isBlank(nodes[0].html))) return emptyState('type-branching', 'Write the first screen to get started.');
    const max = data.scoring ? Math.max(0, ...nodes.filter((n) => n.kind === 'end').map((n) => Number(n.score) || 0)) : 0;
    const root = h('div', { class: 'rs-branch' });
    let history = [];
    const show = (id) => {
      const n = nodes.find((x) => x.id === id);
      const crumbs = h('div', { class: 'rs-branch-top' },
        data.showBack !== false && history.length > 0 && h('button', { class: 'btn sm', type: 'button', onclick: () => { history.pop(); show(history.pop()); } }, icon('arrow-left', { size: 14 }), h('span', {}, 'Back')),
        h('span', { class: 'rs-status' }, `Step ${history.length + 1}`));
      history.push(id);
      if (!n || n.kind === 'end') {
        const score = n ? Number(n.score) || 0 : 0;
        root.replaceChildren(h('div', { class: 'rs-branch-card end' },
          safeUrl(n?.image) && h('img', { src: safeUrl(n.image), alt: '' }),
          h('div', { class: 'body' }, h('p', { class: 'rs-status' }, 'The end'), h('h3', {}, n?.title || 'The end'), n && !isBlank(n.html) && richBlock(n.html),
            data.scoring && max > 0 && h('div', { class: 'rs-score' }, `Score: ${score} / ${max}`),
            h('div', { class: 'rs-actions' }, h('button', { class: 'btn primary rs-accent-btn rs-retry', type: 'button', onclick: () => { history = []; show(nodes[0].id); } }, icon('restore', { size: 16 }), h('span', {}, 'Start again'))))));
        ctx.record?.({ key: 'end', question: 'Ending reached', answer: n?.title || 'The end', correct: '', ok: null, note: data.scoring && max > 0 ? `${score} / ${max}` : '' });
        if (data.scoring && max > 0) ctx.report?.(score, max);
        return;
      }
      root.replaceChildren(crumbs, h('div', { class: 'rs-branch-card' },
        safeUrl(n.image) && h('img', { src: safeUrl(n.image), alt: '' }),
        h('div', { class: 'body' }, n.title && h('h3', {}, n.title), !isBlank(n.html) && richBlock(n.html),
          h('div', { class: 'rs-branch-choices' }, (n.choices || []).filter((c) => c.text?.trim()).map((c) => h('button', { class: 'rs-option', type: 'button', onclick: () => {
            ctx.record?.({ key: `step${history.length}`, question: n.title || htmlToText(n.html) || `Step ${history.length}`, answer: c.text, correct: '', ok: null });
            show(c.next);
          } }, h('span', {}, c.text), icon('chevron-right', { size: 16 })))))));
    };
    show(nodes[0].id);
    return root;
  },
};
