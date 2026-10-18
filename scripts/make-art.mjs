// Generates the illustrated hero and placeholder spot images in public/assets.
// Usage: node scripts/make-art.mjs   (swap in real photos any time)
import { mkdirSync, writeFileSync } from 'node:fs';

const out = new URL('../public/assets/', import.meta.url);
mkdirSync(new URL('spots/', out), { recursive: true });

function flatirons(w, h, base, scale = 1, opacity = 1) {
  // Three tilted sandstone slabs, like the Flatirons above campus.
  const slabs = [
    [0.08, 0.95, 0.24], [0.27, 0.78, 0.22], [0.45, 0.88, 0.26],
  ];
  let s = '';
  slabs.forEach(([x, top, wd], i) => {
    const x0 = x * w, x1 = (x + wd) * w * scale + x0 * (1 - scale);
    const peak = base - top * h;
    s += `<path d="M${x0} ${base} L${x0 + (x1 - x0) * 0.28} ${peak} Q${x0 + (x1 - x0) * 0.36} ${peak - 8} ${x0 + (x1 - x0) * 0.44} ${peak + 6} L${x1} ${base} Z" fill="url(#slab)" opacity="${opacity}"/>`;
    s += `<path d="M${x0 + (x1 - x0) * 0.28} ${peak} L${x0 + (x1 - x0) * 0.22} ${base} L${x0} ${base} Z" fill="#6E3B2A" opacity="${0.35 * opacity}"/>`;
    for (let k = 1; k < 5; k++) {
      const yy = peak + (base - peak) * (k / 5);
      s += `<path d="M${x0 + (x1 - x0) * (0.28 - 0.06 * k / 5) - 2} ${yy} L${x0 + (x1 - x0) * (0.44 + 0.56 * k / 5) - 6} ${yy + 6}" stroke="#7A4130" stroke-width="1.5" opacity="${0.25 * opacity}"/>`;
    }
  });
  return s;
}

function tree(x, y, r, c1 = '#2F6B3A', c2 = '#3F8A4A') {
  return `<rect x="${x - r * 0.12}" y="${y}" width="${r * 0.24}" height="${r * 0.9}" fill="#5B3A24"/>
<circle cx="${x}" cy="${y - r * 0.2}" r="${r}" fill="${c1}"/><circle cx="${x - r * 0.45}" cy="${y + r * 0.1}" r="${r * 0.7}" fill="${c2}"/><circle cx="${x + r * 0.5}" cy="${y + r * 0.05}" r="${r * 0.72}" fill="${c2}"/>`;
}

const defs = `<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9CC8F5"/><stop offset="1" stop-color="#E4F1FC"/></linearGradient>
<linearGradient id="slab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C98B63"/><stop offset="1" stop-color="#9E5B40"/></linearGradient>
<linearGradient id="drive" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B9BEC6"/><stop offset="1" stop-color="#8E959F"/></linearGradient>
</defs>`;

function house({ body, roof, trim = '#FFFFFF', garage = false, w = 400, h = 300 }) {
  const gx = 205, gy = 150;
  return `
<path d="M90 165 L170 105 L250 165 Z" fill="${roof}"/>
<rect x="100" y="160" width="140" height="80" fill="${body}"/>
<rect x="118" y="178" width="30" height="26" fill="#DCEBFA" stroke="${trim}" stroke-width="4"/>
<rect x="190" y="178" width="30" height="26" fill="#DCEBFA" stroke="${trim}" stroke-width="4"/>
<rect x="157" y="196" width="24" height="44" fill="#4A3426"/>
<path d="M235 175 L280 140 L325 175 Z" fill="${roof}"/>
<rect x="240" y="170" width="80" height="70" fill="${body}"/>
${garage
    ? `<rect x="252" y="186" width="56" height="54" fill="#E9ECF1" stroke="#C3C9D2" stroke-width="2"/>${[0, 1, 2, 3].map((i) => `<line x1="252" x2="308" y1="${199 + i * 12}" y2="${199 + i * 12}" stroke="#C3C9D2" stroke-width="2"/>`).join('')}`
    : `<rect x="252" y="186" width="56" height="54" fill="#E9ECF1" stroke="#C3C9D2" stroke-width="2"/>`}`;
}

function spotScene({ body, roof, lawn = '#7DBA5E', garage = true, lot = false, carColor = null, treeAt = 55, carport = false }) {
  const w = 400, h = 300;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${defs}
<rect width="${w}" height="${h}" fill="url(#sky)"/>
${flatirons(w, 90, 150, 1, 0.55)}
<path d="M0 140 Q100 120 200 138 T400 132 V300 H0 Z" fill="#5E9E52" opacity="0.7"/>
<rect y="232" width="${w}" height="68" fill="${lawn}"/>`;
  if (lot) {
    s += `<rect x="70" y="150" width="140" height="82" fill="${body}"/><path d="M60 152 H220 L210 138 H70 Z" fill="${roof}"/>
${[0, 1, 2].map((i) => `<rect x="${86 + i * 42}" y="168" width="26" height="22" fill="#DCEBFA"/>`).join('')}
<path d="M0 232 H400 V300 H0 Z" fill="#7A818B"/>
${[0, 1, 2, 3, 4].map((i) => `<line x1="${40 + i * 80}" y1="240" x2="${30 + i * 80}" y2="300" stroke="#F4F6F8" stroke-width="4"/>`).join('')}
<rect x="300" y="196" width="6" height="36" fill="#3B4552"/><rect x="286" y="176" width="34" height="24" rx="4" fill="#1F5FFF"/><text x="303" y="194" font-family="Arial, sans-serif" font-weight="700" font-size="18" fill="#fff" text-anchor="middle">P</text>`;
  } else {
    s += house({ body, roof, garage });
    if (carport) s += `<rect x="236" y="166" width="88" height="8" fill="#5A6472"/><rect x="238" y="170" width="5" height="70" fill="#5A6472"/><rect x="317" y="170" width="5" height="70" fill="#5A6472"/>`;
    s += `<path d="M252 240 H308 L360 300 H190 Z" fill="url(#drive)"/>`;
  }
  if (carColor) {
    s += `<g transform="translate(${lot ? 120 : 238} ${lot ? 248 : 236})"><rect x="0" y="18" width="88" height="24" rx="8" fill="${carColor}"/><path d="M14 20 L26 4 H62 L76 20 Z" fill="${carColor}"/><path d="M28 8 H44 V19 H20 Z M48 8 H60 L70 19 H48 Z" fill="#CFE3F7"/><circle cx="20" cy="42" r="8" fill="#222"/><circle cx="68" cy="42" r="8" fill="#222"/></g>`;
  }
  s += tree(treeAt, 190, 34) + tree(370, 200, 26, '#2E6436', '#3B7D45');
  s += '</svg>';
  return s;
}

const spots = {
  'driveway-1': spotScene({ body: '#E7C9A5', roof: '#8C4A33' }),
  'driveway-2': spotScene({ body: '#D9DEE5', roof: '#4C5868', treeAt: 40, carColor: '#C8432B' }),
  'driveway-3': spotScene({ body: '#F1E2C6', roof: '#A0522D', carColor: '#2F4F8F' }),
  'driveway-4': spotScene({ body: '#C9D8C5', roof: '#5C4033', treeAt: 70 }),
  'driveway-5': spotScene({ body: '#EBD3C7', roof: '#6B3E2E', carColor: '#E8E8E8' }),
  'garage-1': spotScene({ body: '#DCC3A2', roof: '#7B3F2B', garage: true }),
  'garage-2': spotScene({ body: '#E3E6EA', roof: '#3E4A5A', carport: true, carColor: '#1F7A5A' }),
  'lot-1': spotScene({ body: '#D8B79A', roof: '#8A4B35', lot: true, carColor: '#3A3F47' }),
};
for (const [name, svg] of Object.entries(spots)) writeFileSync(new URL(`spots/${name}.svg`, out), svg);

// Hero: Flatirons over a red-roofed sandstone campus.
function campusBuilding(x, y, w, h, roofH) {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#D9A77C"/>
<path d="M${x - 8} ${y + 2} L${x + w / 2} ${y - roofH} L${x + w + 8} ${y + 2} Z" fill="#B24A2B"/>`;
  const cols = Math.floor(w / 26);
  for (let r = 0; r < Math.floor(h / 34); r++) for (let c = 0; c < cols; c++) {
    s += `<rect x="${x + 10 + c * 26}" y="${y + 12 + r * 34}" width="12" height="18" fill="#7E4A33" opacity="0.75"/>`;
  }
  return s;
}
const W = 1600, H = 760;
let hero = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="hs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3D7FE0"/><stop offset="0.6" stop-color="#8DBEF0"/><stop offset="1" stop-color="#C9E2F8"/></linearGradient>
<linearGradient id="slab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C9845C"/><stop offset="1" stop-color="#8E4E36"/></linearGradient>
<linearGradient id="hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3E7A47"/><stop offset="1" stop-color="#245233"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#hs)"/>
<path d="M0 470 Q300 330 620 380 Q900 250 1200 300 Q1420 260 1600 330 V760 H0 Z" fill="#5C7FA8" opacity="0.5"/>
<g transform="translate(420 0)">${flatirons(1300, 280, 520, 1, 1)}</g>
<path d="M0 520 Q250 470 520 500 Q820 440 1100 480 Q1350 450 1600 470 V760 H0 Z" fill="url(#hill)"/>`;
const blds = [[720, 520, 170, 110, 40], [900, 500, 210, 140, 48], [1130, 530, 150, 100, 36], [1290, 505, 190, 130, 46], [1470, 540, 160, 100, 36], [600, 560, 120, 80, 30]];
blds.forEach((b) => { hero += campusBuilding(...b); });
for (let i = 0; i < 26; i++) {
  const x = 40 + i * 62 + (i % 3) * 9, y = 620 + (i % 4) * 18;
  hero += tree(x, y, 30 + (i % 3) * 8, '#2C6236', '#3A7A43');
}
hero += `<rect y="690" width="${W}" height="70" fill="#2A5A33"/></svg>`;
writeFileSync(new URL('hero.svg', out), hero);
console.log('art written');
