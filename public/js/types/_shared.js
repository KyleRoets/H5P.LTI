// Helpers shared by several content types.
import { h, sanitizeHtml, answersHtml } from '../util.js';

/**
 * Builds the learner view of a rich text containing <mark> answers.
 * mark(answerText) must return the element that replaces each marked answer.
 * word(text) (optional) turns every other word into an element too (Mark the Words).
 */
export function buildAnswerText(data, { mark, word }) {
  const root = h('div', { class: 'rs-text rs-answer-text' });
  root.innerHTML = answersHtml(data);
  [...root.querySelectorAll('mark')].forEach((m) => m.replaceWith(mark(m.textContent.trim())));
  if (word) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('.rs-answer-el') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const frag = document.createDocumentFragment();
      for (const tok of n.textContent.split(/(\s+)/)) {
        if (!tok) continue;
        if (/^\s+$/.test(tok)) { frag.append(tok); continue; }
        const m = tok.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
        if (m[1]) frag.append(m[1]);
        if (m[2]) frag.append(word(m[2]));
        if (m[3]) frag.append(m[3]);
      }
      n.replaceWith(frag);
    }
  }
  return root;
}

export const countAnswers = (data) => {
  const div = document.createElement('div');
  div.innerHTML = answersHtml(data);
  return div.querySelectorAll('mark').length;
};

export { sanitizeHtml };
