import hotspots from './hotspots.js';
import presentation from './presentation.js';
import video from './video.js';
import quiz from './quiz.js';
import dragdrop from './dragdrop.js';
import blanks from './blanks.js';
import dragwords from './dragwords.js';
import cards from './cards.js';
import accordion from './accordion.js';
import markwords from './markwords.js';
import { h, applyStyle } from '../util.js';
import { TYPE_COLORS } from '../covers.js';

// Order = order shown in the "Create new" gallery.
export const TYPE_LIST = [presentation, hotspots, video, quiz, dragdrop, blanks, dragwords, cards, accordion, markwords];
TYPE_LIST.forEach((t) => { t.color = TYPE_COLORS[t.id]; });
export const TYPES = Object.fromEntries(TYPE_LIST.map((t) => [t.id, t]));

/** Renders a content item with its appearance settings applied. */
export function renderContent(type, data, ctx = {}) {
  const t = TYPES[type];
  const root = h('div', { class: 'rs' });
  applyStyle(root, data.style || {});
  try { root.append(t ? t.render(data, ctx) : h('p', {}, 'Unknown content type.')); } catch (e) { console.error(e); root.append(h('p', { class: 'rs-status' }, 'This content could not be displayed.')); }
  return root;
}
