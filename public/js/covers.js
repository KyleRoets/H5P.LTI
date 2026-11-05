// Cover illustrations for each content type (320×180 SVG). Each one sketches what the
// activity looks like in use, so teachers can recognise it at a glance.
export const TYPE_COLORS = {
  presentation: '#2F6FD8', hotspots: '#E0702E', video: '#D23B6B', quiz: '#1F9D6A', dragdrop: '#6C4EE0',
  blanks: '#0E8AA0', dragwords: '#D9940C', cards: '#4E9A2E', accordion: '#47587A', markwords: '#B8326E',
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
};

/** SVG markup for a type's cover. Static strings only (no user input). */
export function coverSvg(type) {
  const c = TYPE_COLORS[type] || '#278DDF';
  return frame(c, DRAW[type] || (() => ''), type);
}
