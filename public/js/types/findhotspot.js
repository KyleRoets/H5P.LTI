import { h, textField, mediaField, listEditor, safeUrl, richField, richBlock, isBlank, checkField, segmentField, emptyState, rid } from '../util.js';
import { icon } from '../icons.js';
import { zoneEditor } from './_shared.js';

export default {
  id: 'findhotspot',
  name: 'Find the Hotspot',
  icon: 'type-findhotspot',
  graded: true,
  category: 'questions',
  tagline: 'Learners click the right place on an image.',
  about: {
    summary: 'Ask a question about an image and learners answer by clicking on it — for example "Click the left ventricle" or "Where is Paris on this map?". You draw the correct area (and optional wrong areas with their own feedback). Use "find all" mode to ask learners to find several things.',
    uses: ['Identify a part on a diagram, map or photo', 'Spot the hazard, error or odd one out', 'Find every instance of something in an image', 'Visual recognition checks without giving options away'],
    learners: 'Learners read the task and click on the image. They get instant feedback — right or wrong, with your explanation. In "find all" mode they keep clicking until they have found every correct area.',
    tip: 'Draw correct areas generously — a little bigger than the object — so small slips on phones still count.',
  },
  defaults: () => ({ task: '', image: '', mode: 'single', showZonesAfter: true, zones: [], wrongFeedback: '' }),
  example: () => ({
    title: 'Find the nucleus',
    data: { task: '<p>Click on the <strong>nucleus</strong> of the cell.</p>', image: '/img/examples/cell.png', mode: 'single', showZonesAfter: true, wrongFeedback: 'Not quite — the nucleus is the control centre in the middle.',
      zones: [
        { id: 'n', x: 44, y: 38, w: 17, h: 26, correct: true, feedback: 'Yes! That\'s the nucleus.' },
        { id: 'm', x: 22, y: 27, w: 17, h: 18, correct: false, feedback: 'That\'s a mitochondrion — it releases energy.' },
      ] },
  }),

  editor(data, ctx) {
    let ze;
    const listHost = h('div');
    const change = () => { ctx.onChange(); ze?.draw(); };
    const drawList = () => listHost.replaceChildren(listEditor({
      items: data.zones, label: 'Areas', addText: 'Add area', onChange: change,
      empty: 'Click on the image above to add an area, then drag it into place.',
      itemLabel: (z, i) => `${z.correct ? 'Correct' : 'Wrong'} area ${i + 1}${z.feedback ? ` · ${z.feedback.slice(0, 30)}` : ''}`,
      create: () => ({ id: rid(), x: 40, y: 40, w: 18, h: 18, correct: true, feedback: '' }),
      renderItem: (z, i, changed) => h('div', {},
        checkField('This is a correct area', z, 'correct', () => { changed(); ze.draw(); }),
        textField('Feedback when clicked (optional)', z, 'feedback', changed, { placeholder: z.correct ? 'e.g. Well spotted!' : 'e.g. That\'s the mitochondrion.' })),
    }));
    ze = zoneEditor({
      getImage: () => safeUrl(data.image), zones: data.zones, onChange: ctx.onChange,
      label: (z, i) => `${z.correct ? '✓' : '✗'} ${i + 1}`, color: (z) => (z.correct ? '#1F9D6A' : '#C8372D'),
      onAdd: (x, y) => { data.zones.push({ id: rid(), x: Math.max(0, x - 8), y: Math.max(0, y - 8), w: 16, h: 16, correct: !data.zones.some((z) => z.correct) || data.mode === 'all', feedback: '' }); ctx.onChange(); drawList(); },
    });
    drawList();
    return h('div', {},
      richField('Task', data, 'task', ctx.onChange, { compact: true, placeholder: 'e.g. Click on the nucleus.' }),
      mediaField('Image', data, 'image', change, ctx),
      h('div', { class: 'field' }, h('div', { class: 'label' }, 'Areas ', h('span', { class: 'hint' }, '— click the image to add, drag to move, corner to resize. Green = correct, red = wrong.')), ze.canvas),
      listHost,
      h('div', { class: 'section-title' }, 'Settings'),
      segmentField('Learners must', data, 'mode', [['single', 'Find one correct area'], ['all', 'Find all correct areas']], ctx.onChange, { showText: true }),
      textField('Feedback for clicks outside any area', data, 'wrongFeedback', ctx.onChange, { placeholder: 'e.g. Not quite — try again.' }),
      checkField('Show the correct areas after answering', data, 'showZonesAfter', ctx.onChange));
  },

  render(data, ctx) {
    const url = safeUrl(data.image);
    const correct = (data.zones || []).filter((z) => z.correct);
    if (!url || !correct.length) return emptyState('type-findhotspot', 'Add an image and at least one correct area.');
    const all = data.mode === 'all';
    const max = all ? correct.length : 1;
    const board = h('div', { class: 'rs-findhs' }, h('img', { src: url, alt: '' }));
    const fb = h('div', { 'aria-live': 'polite' });
    const status = h('span', { class: 'rs-score' });
    const found = new Set(); let wrong = 0; let done = false;
    const zoneEls = data.zones.map((z) => { const el = h('div', { class: `rs-fz ${z.correct ? 'ok' : 'no'}`, style: { left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` } }); board.append(el); return el; });
    const pin = (x, y, ok) => board.append(h('span', { class: `rs-pin ${ok ? 'ok' : 'no'}`, style: { left: `${x}%`, top: `${y}%` } }, icon(ok ? 'check' : 'x', { size: 14, stroke: 3 })));
    const finish = () => {
      done = true;
      if (data.showZonesAfter !== false) board.classList.add('reveal');
      const score = all ? Math.max(0, found.size - wrong) : (found.size ? 1 : 0);
      status.textContent = `${score} / ${max}`; status.classList.remove('hidden');
      retry.classList.remove('hidden');
      ctx.report?.(score, max);
    };
    const say = (ok, text) => fb.replaceChildren(h('div', { class: `rs-feedback ${ok ? 'good' : 'bad'}` }, icon(ok ? 'check' : 'x', { size: 16, stroke: 3 }), h('span', {}, text)));
    board.addEventListener('click', (e) => {
      if (done) return;
      const r = board.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100; const y = ((e.clientY - r.top) / r.height) * 100;
      const hit = data.zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
      if (hit?.correct) {
        if (found.has(hit.id)) return;
        found.add(hit.id); pin(x, y, true); zoneEls[data.zones.indexOf(hit)].classList.add('found');
        say(true, hit.feedback || (all ? `Correct! ${found.size} of ${correct.length} found.` : 'Correct!'));
        if (!all || found.size === correct.length) finish();
      } else {
        wrong++; pin(x, y, false);
        say(false, hit?.feedback || data.wrongFeedback || 'Not quite.');
        if (!all) finish();
      }
    });
    const retry = h('button', { class: 'btn hidden rs-retry', type: 'button', onclick: () => { found.clear(); wrong = 0; done = false; board.classList.remove('reveal'); board.querySelectorAll('.rs-pin').forEach((p) => p.remove()); zoneEls.forEach((z) => z.classList.remove('found')); fb.replaceChildren(); status.classList.add('hidden'); retry.classList.add('hidden'); } }, icon('restore', { size: 16 }), h('span', {}, 'Try again'));
    const giveUp = all && h('button', { class: 'btn', type: 'button', onclick: () => { if (!done) finish(); } }, icon('flag', { size: 16 }), h('span', {}, 'I\'m done'));
    status.classList.add('hidden');
    return h('div', {}, !isBlank(data.task) && richBlock(data.task, 'rs-instructions rs-task'),
      all && h('p', { class: 'rs-status' }, `Find all ${correct.length} correct areas.`),
      board, fb, h('div', { class: 'rs-actions' }, giveUp, retry, status));
  },
};
