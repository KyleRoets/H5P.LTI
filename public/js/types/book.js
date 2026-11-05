import { h, textField, selectField, mediaField, listEditor, safeUrl, richField, richBlock, isBlank, checkField, emptyState, modal, toast, clone } from '../util.js';
import { icon } from '../icons.js';
// Circular import is fine: TYPES is only read inside functions, after all modules have loaded.
import { TYPES, TYPE_LIST } from './index.js';

const nestable = () => TYPE_LIST.filter((t) => t.id !== 'book');

function blockEditor(block, changed, ctx) {
  if (block.kind === 'text') return richField('Text', block, 'html', changed, { placeholder: 'Write this part of the page…' });
  const t = TYPES[block.type];
  if (!t) return h('p', { class: 'help' }, 'Unknown activity type.');
  return h('div', { class: 'nested-editor' }, h('div', { class: 'nested-head' }, h('span', { class: 'ticon', style: { background: t.color } }, icon(t.icon, { size: 14 })), h('strong', {}, t.name)), t.editor(block.data, ctx));
}

export default {
  id: 'book',
  name: 'Interactive Book',
  icon: 'type-book',
  graded: true,
  category: 'stories',
  tagline: 'Chapters that combine text with any of the other activities.',
  about: {
    summary: 'A multi-page resource with a table of contents. Each chapter mixes formatted text with interactive activities of any type — quizzes, hotspots, flashcards, drag and drop and more — so a whole lesson can live in one embed. Scores from all activities add up.',
    uses: ['A complete lesson or mini-module in one place', 'Revision guides with built-in practice', 'Self-paced study units and homework packs', 'Combining explanation and checks without many separate embeds'],
    learners: 'Learners move through chapters using the contents list or the Next/Back buttons. Activities work as normal inside each chapter; the book tracks which chapters they have visited and their total score.',
    tip: 'Keep chapters short (one idea each) and end most chapters with a quick activity. Use "Copy from my library" to reuse things you have already built.',
  },
  defaults: () => ({ cover: true, coverTitle: '', coverText: '', coverImage: '', chapters: [{ title: '', blocks: [{ kind: 'text', html: '' }] }] }),
  example: () => ({
    title: 'All about cells',
    data: { cover: true, coverTitle: 'All about cells', coverText: '<p>A short interactive guide with two chapters.</p>', coverImage: '/img/examples/cell.png',
      chapters: [
        { title: 'What is a cell?', blocks: [
          { kind: 'text', html: '<p>Cells are the <strong>building blocks of life</strong>. Every plant and animal is made of them.</p>' },
          { kind: 'activity', type: 'cards', data: { shuffle: false, cards: [{ front: '<p>Cell</p>', back: '<p>The smallest unit of life</p>', image: '' }, { front: '<p>Organelle</p>', back: '<p>A part inside a cell with a job</p>', image: '' }] } },
        ] },
        { title: 'Check your understanding', blocks: [
          { kind: 'text', html: '<p>Answer this question to finish the book.</p>' },
          { kind: 'activity', type: 'quiz', data: { intro: '', passPercent: 50, shuffleQuestions: false, shuffleOptions: false, questions: [{ kind: 'choice', text: '<p>What controls the cell?</p>', image: '', options: [{ text: 'Nucleus', correct: true }, { text: 'Cell wall', correct: false }], feedbackCorrect: '', feedbackWrong: '' }] } },
        ] },
      ] },
  }),

  editor(data, ctx) {
    const addActivity = async (blocks, redraw) => {
      const sel = h('select', {}, nestable().map((t) => h('option', { value: t.id }, t.name)));
      const v = await modal({ title: 'Add an activity', body: h('div', {}, h('label', {}, 'Activity type', sel), h('p', { class: 'help' }, 'You build it right here, inside the chapter.')), confirm: 'Add' });
      if (v === null) return;
      blocks.push({ kind: 'activity', type: sel.value, data: TYPES[sel.value].defaults() });
      ctx.onChange(); redraw();
    };
    const copyFromLibrary = async (blocks, redraw) => {
      let items;
      try { items = (await ctx.api.get('/api/contents')).filter((c) => c.type !== 'book' && TYPES[c.type]); } catch (e) { toast(e.message, 'error'); return; }
      if (!items.length) { toast('Your library has no activities to copy yet.', 'error'); return; }
      const sel = h('select', {}, items.map((c) => h('option', { value: c.id }, `${c.title} (${TYPES[c.type].name})`)));
      const v = await modal({ title: 'Copy from my library', body: h('div', {}, h('label', {}, 'Item', sel), h('p', { class: 'help' }, 'A copy is placed in this chapter — editing it here doesn\'t change the original.')), confirm: 'Copy in' });
      if (v === null) return;
      const full = await ctx.api.get(`/api/contents/${sel.value}`);
      blocks.push({ kind: 'activity', type: full.type, data: clone(full.data) });
      ctx.onChange(); redraw();
    };
    return h('div', {},
      checkField('Show a cover page', data, 'cover', ctx.onChange),
      h('details', { class: 'more', open: !data.coverTitle }, h('summary', {}, 'Cover page'),
        textField('Book title', data, 'coverTitle', ctx.onChange),
        richField('Introduction', data, 'coverText', ctx.onChange, { compact: true }),
        mediaField('Cover image', data, 'coverImage', ctx.onChange, ctx)),
      listEditor({
        items: data.chapters, label: 'Chapters', addText: 'Add chapter', min: 1, onChange: ctx.onChange, startCollapsed: data.chapters.length > 2,
        itemLabel: (c, i) => `${i + 1}. ${c.title || 'Untitled chapter'} · ${c.blocks.length} part${c.blocks.length === 1 ? '' : 's'}`,
        create: () => ({ title: '', blocks: [{ kind: 'text', html: '' }] }),
        renderItem: (c, i, changed) => {
          const host = h('div');
          const draw = () => host.replaceChildren(listEditor({
            items: c.blocks, label: 'Parts of this chapter', addText: 'Add text', onChange: changed,
            itemLabel: (b, j) => (b.kind === 'text' ? `Text ${j + 1}` : `${TYPES[b.type]?.name || 'Activity'} ${j + 1}`),
            create: () => ({ kind: 'text', html: '' }),
            renderItem: (b, j, ch) => blockEditor(b, ch, { ...ctx, onChange: ch }),
          }), h('div', { class: 'btn-row' },
            h('button', { class: 'btn sm add-btn', type: 'button', onclick: () => addActivity(c.blocks, draw) }, icon('sparkles', { size: 15 }), h('span', {}, 'Add activity')),
            h('button', { class: 'btn sm add-btn', type: 'button', onclick: () => copyFromLibrary(c.blocks, draw) }, icon('copy', { size: 15 }), h('span', {}, 'Copy from my library'))));
          draw();
          return h('div', {}, textField('Chapter title', c, 'title', changed), host);
        },
      }));
  },

  render(data, ctx) {
    const chapters = (data.chapters || []).filter((c) => c.title?.trim() || c.blocks?.length);
    if (!chapters.length) return emptyState('type-book', 'Add a chapter to get started.');
    const scores = new Map();
    const visited = new Set();
    const total = h('span', { class: 'rs-score hidden' });
    const report = () => {
      let s = 0; let m = 0; scores.forEach((v) => { s += v.s; m += v.m; });
      total.textContent = `Score: ${s} / ${m}`; total.classList.toggle('hidden', !m);
      ctx.report?.(s, m);
    };
    const pageEl = h('div', { class: 'rs-book-page' });
    const toc = h('ol', { class: 'rs-book-toc' });
    const progress = h('div', { class: 'rs-progress' }, h('div'));
    let idx = data.cover ? -1 : 0;
    const go = (i) => {
      idx = Math.max(data.cover ? -1 : 0, Math.min(chapters.length - 1, i));
      pageEl.replaceChildren();
      if (idx === -1) {
        pageEl.append(h('div', { class: 'rs-book-cover' }, safeUrl(data.coverImage) && h('img', { src: safeUrl(data.coverImage), alt: '' }),
          h('h2', {}, data.coverTitle || 'Interactive book'), !isBlank(data.coverText) && richBlock(data.coverText),
          h('button', { class: 'btn primary rs-accent-btn', type: 'button', onclick: () => go(0) }, h('span', {}, 'Start reading'), icon('chevron-right', { size: 16 }))));
      } else {
        visited.add(idx);
        const ch = chapters[idx];
        pageEl.append(h('h2', { class: 'rs-book-h' }, ch.title || `Chapter ${idx + 1}`));
        ch.blocks.forEach((b, j) => {
          if (b.kind === 'text') { if (!isBlank(b.html)) pageEl.append(richBlock(b.html)); return; }
          const t = TYPES[b.type]; if (!t) return;
          const key = `${idx}:${j}`;
          try { pageEl.append(h('div', { class: 'rs-book-activity' }, t.render(clone(b.data), { ...ctx, report: (s, m) => { scores.set(key, { s, m }); report(); } }))); } catch (e) { console.error(e); }
        });
        pageEl.append(h('div', { class: 'rs-book-nav' },
          h('button', { class: 'btn sm', type: 'button', disabled: idx === 0 && !data.cover, onclick: () => go(idx - 1) }, icon('chevron-left', { size: 16 }), h('span', {}, 'Back')),
          h('span', { class: 'rs-status' }, `Chapter ${idx + 1} of ${chapters.length}`),
          idx < chapters.length - 1 ? h('button', { class: 'btn sm primary rs-accent-btn', type: 'button', onclick: () => go(idx + 1) }, h('span', {}, 'Next'), icon('chevron-right', { size: 16 })) : h('span', { class: 'rs-book-done' }, icon('check', { size: 15 }), 'End of book')));
      }
      toc.replaceChildren(...chapters.map((c, i) => h('li', { class: `${i === idx ? 'on' : ''} ${visited.has(i) ? 'seen' : ''}` }, h('button', { type: 'button', onclick: () => go(i) }, h('span', { class: 'dot' }, visited.has(i) ? icon('check', { size: 11, stroke: 3 }) : String(i + 1)), h('span', {}, c.title || `Chapter ${i + 1}`)))));
      progress.firstChild.style.width = `${(visited.size / chapters.length) * 100}%`;
    };
    const tocToggle = h('button', { class: 'btn sm rs-book-tocbtn', type: 'button', onclick: () => side.classList.toggle('open') }, icon('menu', { size: 15 }), h('span', {}, 'Contents'));
    const side = h('nav', { class: 'rs-book-side', 'aria-label': 'Chapters' }, h('h4', {}, 'Contents'), toc);
    side.addEventListener('click', (e) => { if (e.target.closest('button')) side.classList.remove('open'); });
    go(idx);
    return h('div', { class: 'rs-book' }, h('div', { class: 'rs-book-bar' }, tocToggle, progress, total), h('div', { class: 'rs-book-body' }, side, pageEl));
  },
};
