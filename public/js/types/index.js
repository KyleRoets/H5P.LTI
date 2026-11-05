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

// Order = order shown in the "Create new" gallery.
export const TYPE_LIST = [presentation, hotspots, video, quiz, dragdrop, blanks, dragwords, cards, accordion, markwords];
export const TYPES = Object.fromEntries(TYPE_LIST.map((t) => [t.id, t]));
