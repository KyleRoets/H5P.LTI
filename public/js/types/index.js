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
import findhotspot from './findhotspot.js';
import order from './order.js';
import matching from './matching.js';
import summary from './summary.js';
import essay from './essay.js';
import dictation from './dictation.js';
import arithmetic from './arithmetic.js';
import memory from './memory.js';
import crossword from './crossword.js';
import wordsearch from './wordsearch.js';
import personality from './personality.js';
import branching from './branching.js';
import book from './book.js';
import timeline from './timeline.js';
import slider from './slider.js';
import beforeafter from './beforeafter.js';
import collage from './collage.js';
import chart from './chart.js';
import guess from './guess.js';
import videoplayer from './videoplayer.js';
import rqquiz from './rqquiz.js';
import { h, applyStyle } from '../util.js';
import { TYPE_COLORS } from '../covers.js';

export const CATEGORIES = [
  { id: 'questions', name: 'Questions & quizzes', icon: 'type-quiz', blurb: 'Check understanding — most of these can send a score to the gradebook.' },
  { id: 'stories', name: 'Lessons & stories', icon: 'type-book', blurb: 'Structure a lesson: slides, books, branching paths, video and timelines.' },
  { id: 'media', name: 'Images & media', icon: 'image', blurb: 'Make pictures and data interactive.' },
  { id: 'games', name: 'Games & practice', icon: 'type-memory', blurb: 'Playful practice: memory, crosswords, word searches and flashcards.' },
];

// Types written before categories existed.
const LEGACY_CATEGORY = { presentation: 'stories', hotspots: 'media', video: 'stories', quiz: 'questions', dragdrop: 'questions', blanks: 'questions', dragwords: 'questions', cards: 'games', accordion: 'stories', markwords: 'questions' };

// Order = order within each category in the "Create new" gallery.
export const TYPE_LIST = [
  // Questions & quizzes
  quiz, blanks, dragdrop, dragwords, markwords, findhotspot, order, matching, summary, essay, dictation, arithmetic,
  // Lessons & stories
  presentation, book, branching, video, timeline, accordion,
  // Images & media
  videoplayer, hotspots, slider, beforeafter, collage, chart, guess,
  // Games & practice
  memory, crossword, wordsearch, cards, personality,
];
TYPE_LIST.forEach((t) => { t.color = TYPE_COLORS[t.id]; t.category ||= LEGACY_CATEGORY[t.id] || 'media'; });
export const TYPES = Object.fromEntries(TYPE_LIST.map((t) => [t.id, t]));
// Course quizzes (ReachQuizzes) play like any item but are not in the gallery.
rqquiz.color = '#193B82';
TYPES.rqquiz = rqquiz;

/** Renders a content item with its appearance settings applied. */
export function renderContent(type, data, ctx = {}) {
  const t = TYPES[type];
  const root = h('div', { class: 'rs' });
  applyStyle(root, data.style || {});
  try { root.append(t ? t.render(data, ctx) : h('p', {}, 'Unknown content type.')); } catch (e) { console.error(e); root.append(h('p', { class: 'rs-status' }, 'This content could not be displayed.')); }
  return root;
}
