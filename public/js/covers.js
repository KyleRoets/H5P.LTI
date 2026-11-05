// Cover illustrations for each content type (320×180 SVG). Each one sketches what the
// activity looks like in use, so teachers can recognise it at a glance.
export const TYPE_COLORS = {
  presentation: '#2F6FD8', hotspots: '#E0702E', video: '#D23B6B', quiz: '#1F9D6A', dragdrop: '#6C4EE0',
  blanks: '#0E8AA0', dragwords: '#D9940C', cards: '#4E9A2E', accordion: '#47587A', markwords: '#B8326E',
  findhotspot: '#C2410C', order: '#0F766E', matching: '#7C3AED', summary: '#2563EB', essay: '#475569', dictation: '#BE185D',
  arithmetic: '#15803D', memory: '#9333EA', crossword: '#1E40AF', wordsearch: '#B45309', personality: '#DB2777',
  branching: '#0891B2', book: '#1D4ED8', timeline: '#A16207', slider: '#0369A1', beforeafter: '#4D7C0F', collage: '#C026D3',
  chart: '#0D9488', guess: '#EA580C',
};

const W = '#ffffff';
const line = (x, y, w, c = '#C9D3E3', hgt = 7) => `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="${hgt / 2}" fill="${c}"/>`;
const shadow = (id) => `<filter id="${id}" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#0b1f4a" flood-opacity=".16"/></filter>`;

function frame(c, inner, id) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".16"/><stop offset="1" stop-color="${c}" stop-opacity=".32"/></linearGradient>${shadow(`s${id}`)}</defs>
  <rect width="320" height="180" fill="url(#g${id})"/>
  <circle cx="292" cy="22" r="46" fill="${c}" opacity=".10"/><circle cx="18" cy="170" r="38" fill="${c}" opacity=".10"/>
  ${inner(c, `url(#s${id})`)}</svg>`;
}

const DRAW = {
  presentation: (c, sh) => `
    <g filter="${sh}"><rect x="54" y="22" width="212" height="122" rx="10" fill="${W}"/></g>
    ${line(74, 42, 92, c, 12)}${line(74, 66, 84)}${line(74, 80, 72)}${line(74, 94, 80)}${line(74, 108, 56)}
    <rect x="176" y="58" width="72" height="64" rx="8" fill="${c}" opacity=".18"/>
    <path d="M182 116l18-22 14 14 10-10 18 18Z" fill="${c}" opacity=".55"/><circle cx="230" cy="74" r="7" fill="${c}" opacity=".55"/>
    <circle cx="146" cy="160" r="4" fill="${c}"/><circle cx="160" cy="160" r="4" fill="${c}" opacity=".35"/><circle cx="174" cy="160" r="4" fill="${c}" opacity=".35"/>
    <path d="M118 154l-6 6 6 6M202 154l6 6-6 6" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  hotspots: (c, sh) => `
    <g filter="${sh}"><rect x="36" y="20" width="248" height="140" rx="12" fill="${W}"/></g>
    <rect x="44" y="28" width="232" height="124" rx="8" fill="${c}" opacity=".14"/>
    <path d="M44 132c30-26 52-34 78-20s44 4 66-14 52-14 88 10v36a8 8 0 0 1-8 8H52a8 8 0 0 1-8-8Z" fill="${c}" opacity=".28"/>
    ${[[98, 70, '1'], [196, 104, '2'], [238, 58, '3']].map(([x, y, n]) => `<circle cx="${x}" cy="${y}" r="15" fill="${c}" opacity=".25"/><circle cx="${x}" cy="${y}" r="11" fill="${c}" stroke="#fff" stroke-width="3"/><text x="${x}" y="${y + 4.5}" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">${n}</text>`).join('')}
    <g filter="${sh}"><rect x="118" y="44" width="96" height="50" rx="8" fill="${W}"/></g>${line(128, 54, 52, c, 8)}${line(128, 70, 74)}${line(128, 81, 60)}`,
  video: (c, sh) => `
    <g filter="${sh}"><rect x="40" y="18" width="240" height="140" rx="12" fill="#1b2a4a"/></g>
    <rect x="40" y="18" width="240" height="140" rx="12" fill="${c}" opacity=".25"/>
    <g filter="${sh}"><rect x="96" y="40" width="128" height="80" rx="9" fill="${W}"/></g>
    ${line(108, 52, 70, c, 8)}
    <rect x="108" y="68" width="104" height="16" rx="5" fill="${c}" opacity=".18"/><circle cx="117" cy="76" r="4" fill="${c}"/>${line(126, 73, 60, '#9fb0c9', 6)}
    <rect x="108" y="90" width="104" height="16" rx="5" fill="#eef2f8"/><circle cx="117" cy="98" r="4" fill="none" stroke="#9fb0c9" stroke-width="2"/>${line(126, 95, 48, '#c9d3e3', 6)}
    <rect x="56" y="140" width="208" height="5" rx="2.5" fill="#ffffff" opacity=".35"/><rect x="56" y="140" width="96" height="5" rx="2.5" fill="${c}"/>
    <path d="M118 135l6 7.5-6 7.5-6-7.5Z" fill="#fff"/><path d="M196 135l6 7.5-6 7.5-6-7.5Z" fill="#fff" opacity=".7"/>`,
  quiz: (c, sh) => `
    <g filter="${sh}"><rect x="64" y="16" width="192" height="148" rx="12" fill="${W}"/></g>
    <rect x="80" y="30" width="160" height="6" rx="3" fill="#e6ebf3"/><rect x="80" y="30" width="96" height="6" rx="3" fill="${c}"/>
    ${line(80, 48, 120, '#2b3a55', 9)}
    <rect x="80" y="68" width="160" height="22" rx="7" fill="${c}" opacity=".14" stroke="${c}" stroke-width="2"/>
    <circle cx="94" cy="79" r="7" fill="${c}"/><path d="M90.5 79l2.5 2.5 4.5-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${line(108, 75.5, 80, c)}
    <rect x="80" y="96" width="160" height="22" rx="7" fill="#fff" stroke="#dbe2ec" stroke-width="2"/><circle cx="94" cy="107" r="6" fill="none" stroke="#a9b6c9" stroke-width="2"/>${line(108, 103.5, 64)}
    <rect x="80" y="124" width="160" height="22" rx="7" fill="#fff" stroke="#dbe2ec" stroke-width="2"/><circle cx="94" cy="135" r="6" fill="none" stroke="#a9b6c9" stroke-width="2"/>${line(108, 131.5, 72)}`,
  dragdrop: (c, sh) => `
    <g filter="${sh}"><rect x="36" y="16" width="248" height="108" rx="12" fill="${W}"/></g>
    <rect x="48" y="28" width="106" height="84" rx="9" fill="${c}" opacity=".08" stroke="${c}" stroke-width="2" stroke-dasharray="6 5"/>
    <rect x="166" y="28" width="106" height="84" rx="9" fill="${c}" opacity=".08" stroke="${c}" stroke-width="2" stroke-dasharray="6 5"/>
    <rect x="62" y="44" width="64" height="20" rx="6" fill="${c}"/>${line(72, 50.5, 40, '#fff')}
    <rect x="62" y="134" width="70" height="22" rx="7" fill="#fff" stroke="${c}" stroke-width="2"/>${line(73, 141.5, 46, c)}
    <g filter="${sh}" transform="rotate(-6 214 86)"><rect x="180" y="74" width="74" height="24" rx="7" fill="${c}"/>${line(192, 82.5, 48, '#fff')}</g>
    <path d="M238 96l0 22 6-6 5 10 4-2-5-10 8 0Z" fill="#1b2a4a" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="146" y="134" width="70" height="22" rx="7" fill="#fff" stroke="${c}" stroke-width="2"/>${line(157, 141.5, 40, c)}`,
  blanks: (c, sh) => `
    <g filter="${sh}"><rect x="42" y="24" width="236" height="132" rx="12" fill="${W}"/></g>
    ${line(62, 46, 56)}<rect x="124" y="40" width="70" height="19" rx="5" fill="${c}" opacity=".12" stroke="${c}" stroke-width="2"/>${line(132, 46, 40, c)}${line(200, 46, 56)}
    ${line(62, 76, 100)}<rect x="168" y="70" width="64" height="19" rx="5" fill="#fff" stroke="#a9b6c9" stroke-width="2"/><path d="M178 74v11" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    ${line(62, 106, 30)}<rect x="98" y="100" width="64" height="19" rx="5" fill="#fff" stroke="#a9b6c9" stroke-width="2"/>${line(168, 106, 84)}
    <rect x="62" y="130" width="54" height="16" rx="6" fill="${c}"/>${line(72, 134.5, 34, '#fff')}`,
  dragwords: (c, sh) => `
    <g filter="${sh}"><rect x="40" y="18" width="240" height="96" rx="12" fill="${W}"/></g>
    ${line(58, 36, 70)}<rect x="134" y="30" width="58" height="20" rx="4" fill="#f1f4f9"/><path d="M134 50h58" stroke="#a9b6c9" stroke-width="2"/>${line(198, 36, 62)}
    ${line(58, 66, 40)}<rect x="104" y="60" width="58" height="20" rx="5" fill="#fff" stroke="${c}" stroke-width="2"/>${line(113, 66.5, 40, c)}${line(168, 66, 90)}
    ${line(58, 94, 120)}
    <rect x="58" y="132" width="58" height="22" rx="7" fill="#fff" stroke="${c}" stroke-width="2"/>${line(68, 139.5, 38, c)}
    <rect x="124" y="132" width="50" height="22" rx="7" fill="#fff" stroke="${c}" stroke-width="2"/>${line(134, 139.5, 30, c)}
    <g filter="${sh}" transform="rotate(-5 170 45)"><rect x="196" y="122" width="62" height="24" rx="7" fill="${c}"/>${line(207, 130.5, 40, '#fff')}</g>
    <path d="M222 118c-6-30-24-50-40-60" stroke="${c}" stroke-width="2.5" fill="none" stroke-dasharray="5 5" stroke-linecap="round"/>`,
  cards: (c, sh) => `
    <g filter="${sh}" transform="rotate(-8 130 92)"><rect x="66" y="40" width="128" height="96" rx="12" fill="${c}"/>${line(92, 80, 76, '#fff', 9)}${line(104, 96, 52, '#ffffff99')}</g>
    <g filter="${sh}" transform="rotate(6 196 88)"><rect x="132" y="36" width="128" height="96" rx="12" fill="${W}"/>
      <circle cx="196" cy="74" r="16" fill="${c}" opacity=".15"/><text x="196" y="81" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="${c}" text-anchor="middle">?</text>${line(160, 102, 72)}</g>
    <path d="M118 158c26 12 62 12 88-2" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M200 150l7 6-9 4" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  accordion: (c, sh) => `
    <g filter="${sh}"><rect x="56" y="16" width="208" height="148" rx="12" fill="${W}"/></g>
    <rect x="56" y="16" width="208" height="30" rx="12" fill="#f6f8fb"/>${line(72, 27, 100, '#2b3a55')}<path d="M244 27v8M240 31h8" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M56 46h208" stroke="#e3e8f0" stroke-width="2"/>
    <rect x="56" y="47" width="208" height="30" fill="${c}" opacity=".14"/>${line(72, 58, 86, c)}<path d="M240 62h8" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
    ${line(72, 88, 168)}${line(72, 101, 150)}${line(72, 114, 120)}
    <path d="M56 128h208" stroke="#e3e8f0" stroke-width="2"/>${line(72, 142, 110, '#2b3a55')}<path d="M244 142v8M240 146h8" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`,
  markwords: (c, sh) => `
    <g filter="${sh}"><rect x="40" y="22" width="240" height="136" rx="12" fill="${W}"/></g>
    ${[[60, 44, [30, 40, 24, 44, 30]], [60, 72, [26, 50, 34, 28, 36]], [60, 100, [44, 28, 40, 32]], [60, 128, [34, 46, 26]]].map(([x, y, ws], r) => {
      let cx = x; return ws.map((w, i) => { const hl = (r === 0 && i === 1) || (r === 1 && i === 3) || (r === 2 && i === 0) || (r === 3 && i === 1);
        const out = hl ? `<rect x="${cx - 3}" y="${y - 4}" width="${w + 6}" height="15" rx="4" fill="${c}" opacity=".28"/><rect x="${cx}" y="${y}" width="${w}" height="7" rx="3.5" fill="${c}"/>` : `<rect x="${cx}" y="${y}" width="${w}" height="7" rx="3.5" fill="#c9d3e3"/>`;
        cx += w + 8; return out; }).join(''); }).join('')}
    <g transform="rotate(35 244 120)"><rect x="232" y="78" width="22" height="58" rx="5" fill="${c}"/><path d="M234 136h18l-4 12h-10Z" fill="#1b2a4a"/><rect x="232" y="90" width="22" height="8" fill="#fff" opacity=".35"/></g>`,
  findhotspot: (c, sh) => `
    <g filter="${sh}"><rect x="40" y="18" width="240" height="144" rx="12" fill="${W}"/></g>
    <rect x="50" y="28" width="220" height="124" rx="8" fill="${c}" opacity=".12"/>
    <ellipse cx="160" cy="92" rx="80" ry="48" fill="${c}" opacity=".18"/><circle cx="168" cy="90" r="18" fill="${c}" opacity=".35"/>
    <rect x="146" y="68" width="44" height="44" rx="6" fill="none" stroke="#1F9D6A" stroke-width="3" stroke-dasharray="6 4"/>
    <circle cx="168" cy="90" r="12" fill="none" stroke="${c}" stroke-width="3"/><path d="M168 72v8M168 100v8M150 90h8M178 90h8" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <path d="M196 108l0 26 7-7 6 12 5-2-6-12 9 0Z" fill="#1b2a4a" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>`,
  order: (c, sh) => `
    ${[0, 1, 2, 3].map((i) => `<g filter="${sh}" transform="translate(${i === 1 ? 14 : 0} 0)"><rect x="72" y="${24 + i * 34}" width="176" height="26" rx="7" fill="${i === 1 ? c : W}"/></g>
      <text x="${i === 1 ? 100 : 86}" y="${42 + i * 34}" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="${i === 1 ? '#fff' : c}">${i + 1}</text>${line(i === 1 ? 118 : 104, 34 + i * 34, 90 - i * 10, i === 1 ? '#ffffff' : '#c9d3e3')}`).join('')}
    <path d="M272 70v40M264 78l8-8 8 8M264 102l8 8 8-8" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  matching: (c, sh) => `
    ${[0, 1, 2].map((i) => `<g filter="${sh}"><rect x="46" y="${28 + i * 44}" width="86" height="30" rx="7" fill="${W}"/><rect x="190" y="${28 + i * 44}" width="86" height="30" rx="7" fill="${i === 1 ? W : c}" ${i === 1 ? `stroke="${c}" stroke-width="2" stroke-dasharray="5 4"` : ''}/></g>${line(58, 39 + i * 44, 56)}${i !== 1 ? line(202, 39 + i * 44, 56, '#ffffff') : ''}`).join('')}
    <path d="M132 43h58M132 131h58" stroke="${c}" stroke-width="2.5"/><circle cx="132" cy="43" r="4" fill="${c}"/><circle cx="190" cy="43" r="4" fill="${c}"/><circle cx="132" cy="131" r="4" fill="${c}"/><circle cx="190" cy="131" r="4" fill="${c}"/>
    <g filter="${sh}" transform="rotate(-4 220 150)"><rect x="176" y="140" width="86" height="28" rx="7" fill="${c}"/>${line(188, 150, 56, '#ffffff')}</g>`,
  summary: (c, sh) => `
    <g filter="${sh}"><rect x="40" y="22" width="150" height="136" rx="12" fill="${W}"/></g>
    <rect x="52" y="36" width="126" height="24" rx="6" fill="#fff" stroke="#dbe2ec" stroke-width="2"/>${line(62, 45, 80)}
    <rect x="52" y="68" width="126" height="24" rx="6" fill="${c}" opacity=".14" stroke="${c}" stroke-width="2"/>${line(62, 77, 96, c)}
    <rect x="52" y="100" width="126" height="24" rx="6" fill="#fff" stroke="#dbe2ec" stroke-width="2"/>${line(62, 109, 70)}
    <g filter="${sh}"><rect x="200" y="40" width="88" height="104" rx="10" fill="${W}"/></g>
    ${[0, 1, 2].map((i) => `<circle cx="214" cy="${62 + i * 26}" r="6" fill="${i < 2 ? '#1F9D6A' : '#dbe2ec'}"/>${line(226, 59 + i * 26, i < 2 ? 50 : 36, i < 2 ? '#9fb0c9' : '#e3e8f0')}`).join('')}`,
  essay: (c, sh) => `
    <g filter="${sh}"><rect x="56" y="18" width="208" height="144" rx="12" fill="${W}"/></g>
    ${line(74, 34, 120, '#2b3a55', 9)}
    <rect x="74" y="54" width="172" height="74" rx="8" fill="#f6f8fb" stroke="#dbe2ec" stroke-width="2"/>
    ${line(86, 66, 140)}${line(86, 80, 120)}${line(86, 94, 132)}${line(86, 108, 64)}<path d="M152 104v14" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="74" y="138" width="56" height="14" rx="5" fill="${c}"/><rect x="138" y="138" width="40" height="14" rx="7" fill="#1F9D6A" opacity=".2"/>
    <g transform="rotate(40 240 60)"><rect x="232" y="20" width="14" height="62" rx="4" fill="${c}"/><path d="M232 82h14l-7 14Z" fill="#1b2a4a"/></g>`,
  dictation: (c, sh) => `
    <g filter="${sh}"><rect x="48" y="30" width="224" height="120" rx="12" fill="${W}"/></g>
    <circle cx="86" cy="70" r="20" fill="${c}"/><path d="M80 60l16 10-16 10Z" fill="#fff"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<rect x="${118 + i * 13}" y="${70 - [8, 16, 24, 14, 20, 10, 22, 12, 6, 16][i] / 2}" width="7" height="${[8, 16, 24, 14, 20, 10, 22, 12, 6, 16][i]}" rx="3.5" fill="${c}" opacity="${i < 5 ? 1 : 0.35}"/>`).join('')}
    <rect x="68" y="106" width="184" height="26" rx="7" fill="#f6f8fb" stroke="${c}" stroke-width="2"/>${line(80, 115, 50, '#1F9D6A')}${line(136, 115, 40, '#C8372D')}<path d="M182 112v14" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`,
  arithmetic: (c, sh) => `
    <g filter="${sh}"><rect x="62" y="26" width="196" height="128" rx="14" fill="${W}"/></g>
    <text x="160" y="92" font-family="Arial, sans-serif" font-size="40" font-weight="800" fill="#1b2a4a" text-anchor="middle">7 × 8 =</text>
    <rect x="108" y="108" width="104" height="30" rx="8" fill="${c}" opacity=".14" stroke="${c}" stroke-width="2"/><text x="160" y="130" font-family="Arial, sans-serif" font-size="20" font-weight="800" fill="${c}" text-anchor="middle">56</text>
    <circle cx="236" cy="48" r="14" fill="none" stroke="${c}" stroke-width="3"/><path d="M236 40v8l5 3" stroke="${c}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  memory: (c, sh) => `
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const x = 58 + (i % 4) * 52; const y = 22 + Math.floor(i / 4) * 72; const up = i === 1 || i === 6; const done = i === 2 || i === 4;
      return `<g filter="${sh}"><rect x="${x}" y="${y}" width="44" height="62" rx="8" fill="${up || done ? W : c}" ${done ? `stroke="#1F9D6A" stroke-width="3"` : ''}/></g>${up || done ? `<circle cx="${x + 22}" cy="${y + 26}" r="11" fill="${done ? '#1F9D6A' : c}" opacity=".7"/>${line(x + 9, y + 44, 26)}` : `<text x="${x + 22}" y="${y + 38}" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="#fff" opacity=".7" text-anchor="middle">?</text>`}`; }).join('')}`,
  crossword: (c, sh) => {
    const cells = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [0, 2], [2, 2], [3, 2], [3, 3], [3, 4], [2, 4], [4, 4]];
    return `<g filter="${sh}"><rect x="74" y="12" width="172" height="156" rx="12" fill="${W}"/></g>
    ${cells.map(([r, col], i) => `<rect x="${92 + col * 28}" y="${24 + r * 28}" width="26" height="26" rx="3" fill="${[0, 1, 2].includes(i) ? c : '#fff'}" ${[0, 1, 2].includes(i) ? 'opacity=".22"' : ''} stroke="#9fb0c9" stroke-width="1.5"/>`).join('')}
    <text x="96" y="58" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#47587a">1</text><text x="152" y="30" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#47587a">2</text>
    <text x="105" y="70" font-family="Arial, sans-serif" font-size="15" font-weight="800" fill="${c}" text-anchor="middle">C</text><text x="133" y="70" font-family="Arial, sans-serif" font-size="15" font-weight="800" fill="${c}" text-anchor="middle">E</text><text x="161" y="70" font-family="Arial, sans-serif" font-size="15" font-weight="800" fill="${c}" text-anchor="middle">L</text>`;
  },
  wordsearch: (c, sh) => {
    const L = 'NUCLEUSBWALLCERKMEMBRANETPOXCELLQ'.split('');
    return `<g filter="${sh}"><rect x="66" y="14" width="188" height="152" rx="12" fill="${W}"/></g>
    <rect x="80" y="30" width="158" height="22" rx="11" fill="${c}" opacity=".25"/>
    <rect x="80" y="110" width="102" height="22" rx="11" fill="#1F9D6A" opacity=".22"/>
    ${L.slice(0, 32).map((ch, i) => `<text x="${91 + (i % 8) * 20}" y="${46 + Math.floor(i / 8) * 26 + (i >= 24 ? 1 : 0)}" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#2b3a55" text-anchor="middle">${ch}</text>`).join('')}
    <circle cx="232" cy="140" r="14" fill="none" stroke="${c}" stroke-width="4"/><path d="M242 150l12 12" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
  },
  personality: (c, sh) => `
    <g filter="${sh}"><rect x="46" y="26" width="120" height="128" rx="12" fill="${W}"/></g>
    ${[0, 1, 2].map((i) => `<rect x="58" y="${44 + i * 32}" width="96" height="24" rx="7" fill="${i === 1 ? c : '#fff'}" ${i === 1 ? '' : 'stroke="#dbe2ec" stroke-width="2"'}/>${line(68, 52 + i * 32, 60, i === 1 ? '#ffffff' : '#c9d3e3')}`).join('')}
    <path d="M176 90h18" stroke="${c}" stroke-width="3" stroke-linecap="round"/><path d="M188 84l6 6-6 6" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <g filter="${sh}"><rect x="204" y="34" width="78" height="112" rx="12" fill="${W}"/></g>
    <circle cx="243" cy="74" r="20" fill="${c}" opacity=".85"/><circle cx="243" cy="68" r="7" fill="#fff"/><path d="M231 86a12 12 0 0 1 24 0" fill="#fff"/>${line(218, 106, 50, c)}${line(222, 120, 42)}
    <path d="M268 40l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1Z" fill="#D9940C"/>`,
  branching: (c, sh) => `
    <g filter="${sh}"><rect x="40" y="70" width="70" height="40" rx="9" fill="${c}"/></g>${line(52, 87, 46, '#ffffff')}
    <path d="M110 90c30 0 30-48 60-48M110 90c30 0 30 48 60 48" stroke="${c}" stroke-width="3" fill="none"/>
    <g filter="${sh}"><rect x="170" y="24" width="70" height="36" rx="9" fill="${W}"/><rect x="170" y="120" width="70" height="36" rx="9" fill="${W}"/></g>${line(182, 39, 46)}${line(182, 135, 46)}
    <path d="M240 42c16 0 16-14 32-14M240 42c16 0 16 14 32 14" stroke="#9fb0c9" stroke-width="2.5" fill="none"/>
    <circle cx="276" cy="28" r="8" fill="#1F9D6A"/><circle cx="276" cy="56" r="8" fill="#D9940C"/><circle cx="270" cy="138" r="8" fill="#C8372D"/><path d="M240 138h22" stroke="#9fb0c9" stroke-width="2.5"/>`,
  book: (c, sh) => `
    <g filter="${sh}"><path d="M60 30h96v124H72a12 12 0 0 1-12-12Z" fill="${W}"/><path d="M164 30h96v112a12 12 0 0 1-12 12h-84Z" fill="${W}"/></g>
    <path d="M156 30h8v124h-8z" fill="${c}" opacity=".5"/>
    ${line(74, 46, 64, c, 9)}${line(74, 66, 70)}${line(74, 80, 60)}${line(74, 94, 66)}
    <rect x="176" y="44" width="72" height="44" rx="6" fill="${c}" opacity=".16"/><circle cx="192" cy="58" r="6" fill="${c}"/>${line(204, 55, 36, c)}${line(178, 100, 66)}${line(178, 114, 54)}
    <rect x="178" y="126" width="40" height="14" rx="5" fill="${c}"/>
    <g transform="translate(40 26)"><rect width="16" height="40" rx="3" fill="#D9940C"/><path d="M0 40l8-7 8 7Z" fill="${W}"/></g>`,
  timeline: (c, sh) => `
    <path d="M30 104h260" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
    ${[60, 120, 180, 240].map((x, i) => `<circle cx="${x}" cy="104" r="${i === 2 ? 11 : 8}" fill="${i <= 2 ? c : '#fff'}" stroke="${c}" stroke-width="3"/><rect x="${x - 20}" y="118" width="40" height="10" rx="5" fill="#9fb0c9" opacity=".7"/>`).join('')}
    <g filter="${sh}"><rect x="120" y="22" width="120" height="66" rx="10" fill="${W}"/></g>
    <path d="M174 88l6 8 6-8Z" fill="${W}"/>${line(134, 36, 40, c, 8)}${line(134, 52, 92)}${line(134, 66, 76)}
    <rect x="200" y="32" width="28" height="22" rx="4" fill="${c}" opacity=".2"/>`,
  slider: (c, sh) => `
    <g filter="${sh}"><rect x="58" y="22" width="204" height="122" rx="12" fill="${W}"/></g>
    <rect x="66" y="30" width="188" height="106" rx="8" fill="${c}" opacity=".16"/>
    <path d="M66 126l46-42 32 28 24-18 86 52v-10a10 10 0 0 0-10-10H76a10 10 0 0 0-10 10Z" fill="${c}" opacity=".45"/><circle cx="214" cy="58" r="12" fill="${c}" opacity=".55"/>
    <circle cx="66" cy="83" r="14" fill="#fff" stroke="#dbe2ec" stroke-width="2"/><path d="M69 76l-7 7 7 7" stroke="#1b2a4a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="254" cy="83" r="14" fill="#fff" stroke="#dbe2ec" stroke-width="2"/><path d="M251 76l7 7-7 7" stroke="#1b2a4a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="146" cy="160" r="4" fill="${c}" opacity=".35"/><circle cx="160" cy="160" r="4" fill="${c}"/><circle cx="174" cy="160" r="4" fill="${c}" opacity=".35"/>`,
  beforeafter: (c, sh) => `
    <g filter="${sh}"><rect x="50" y="22" width="220" height="136" rx="12" fill="${W}"/></g>
    <rect x="58" y="30" width="102" height="120" rx="6" fill="#e3e8f0"/><path d="M58 130l30-30 24 20 20-14 28 22v16a6 6 0 0 1-6 6H64a6 6 0 0 1-6-6Z" fill="#9fb0c9"/>
    <rect x="160" y="30" width="102" height="120" rx="6" fill="${c}" opacity=".22"/><path d="M160 130l-.0 0 16-16 30 26 20-14 36 24v10a6 6 0 0 1-6 6h-96Z" fill="${c}" opacity=".6"/><circle cx="232" cy="58" r="10" fill="#D9940C"/>
    <path d="M160 22v136" stroke="#fff" stroke-width="4"/><circle cx="160" cy="90" r="15" fill="#fff" stroke="${c}" stroke-width="3"/>
    <path d="M155 84l-5 6 5 6M165 84l5 6-5 6" stroke="${c}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  collage: (c, sh) => `
    <g filter="${sh}"><rect x="56" y="20" width="208" height="140" rx="12" fill="${W}"/></g>
    <rect x="64" y="28" width="104" height="124" rx="6" fill="${c}" opacity=".5"/><path d="M64 120l30-28 26 22 24-18 24 20v30a6 6 0 0 1-6 6H70a6 6 0 0 1-6-6Z" fill="${c}"/>
    <rect x="174" y="28" width="82" height="58" rx="6" fill="${c}" opacity=".22"/><circle cx="196" cy="50" r="10" fill="${c}" opacity=".6"/>
    <rect x="174" y="92" width="82" height="60" rx="6" fill="#D9940C" opacity=".35"/><path d="M174 140l22-18 18 14 16-10 26 20v0a6 6 0 0 1-6 6h-70a6 6 0 0 1-6-6Z" fill="#D9940C" opacity=".6"/>`,
  chart: (c, sh) => `
    <g filter="${sh}"><rect x="50" y="18" width="220" height="144" rx="12" fill="${W}"/></g>
    <path d="M74 140h176M74 34v106" stroke="#c9d3e3" stroke-width="2"/>
    ${[[90, 70], [124, 92], [158, 48], [192, 80], [226, 104]].map(([x, hgt], i) => `<rect x="${x}" y="${140 - hgt}" width="24" height="${hgt}" rx="5" fill="${c}" opacity="${i === 4 ? 1 : 0.35 + i * 0.12}"/>`).join('')}
    ${line(84, 28, 70, '#2b3a55', 8)}`,
  guess: (c, sh) => `
    <g filter="${sh}"><rect x="48" y="22" width="132" height="136" rx="12" fill="${W}"/></g>
    <rect x="58" y="32" width="112" height="84" rx="8" fill="${c}" opacity=".22"/><circle cx="114" cy="74" r="26" fill="${c}" opacity=".5"/>
    <text x="114" y="86" font-family="Arial, sans-serif" font-size="32" font-weight="800" fill="#fff" text-anchor="middle">?</text>
    ${line(60, 126, 90, '#2b3a55')}<rect x="60" y="138" width="70" height="12" rx="6" fill="${c}"/>
    <g filter="${sh}"><rect x="194" y="58" width="90" height="64" rx="10" fill="${W}"/></g>
    <path d="M206 76c8-12 26-12 34 0-8 12-26 12-34 0Z" fill="none" stroke="${c}" stroke-width="2.5"/><circle cx="223" cy="76" r="4" fill="${c}"/>${line(206, 98, 66)}${line(206, 108, 48)}`,
};

/** SVG markup for a type's cover. Static strings only (no user input). */
export function coverSvg(type) {
  const c = TYPE_COLORS[type] || '#278DDF';
  return frame(c, DRAW[type] || (() => ''), type);
}
