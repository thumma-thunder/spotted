// Small shared helpers: HTML escaping, formatting, icons, toasts, modal.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = (cents, { decimals } = {}) => {
  const d = decimals ?? (cents % 100 === 0 ? 0 : 2);
  return `$${(cents / 100).toFixed(d)}`;
};

export const PERIODS = {
  day: { label: 'By the Day', unit: 'day', short: '/day', search: 'A day', plural: 'days' },
  week: { label: 'By the Week', unit: 'week', short: '/week', search: 'A week', plural: 'weeks' },
  month: { label: 'By the Month', unit: 'month', short: '/month', search: 'A month', plural: 'months' },
  event: { label: 'Event (e.g., CU Game)', unit: 'game', short: '/game', search: 'Game day', plural: 'games' },
};
export const MAX_QTY = { day: 14, week: 8, month: 6, event: 1 };

export const SPOT_TYPES = {
  driveway: { label: 'Driveway', icon: 'car' },
  garage: { label: 'Garage', icon: 'garage' },
  lot: { label: 'Parking Lot', icon: 'lot' },
  other: { label: 'Other', icon: 'dots' },
};

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const priceCents = (spot, period) => spot[`price_${period}_cents`];

// Cheapest way to express a spot's price, preferring the period asked for.
export function headlinePrice(spot, preferred) {
  const p = preferred && spot.rent_options.includes(preferred) ? preferred : ['day', 'event', 'week', 'month'].find((x) => spot.rent_options.includes(x));
  return { period: p, cents: priceCents(spot, p) };
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDaysISO = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); };
export const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fmtDate = (s, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => parseISO(s).toLocaleDateString('en-US', opts);
export const fmtDay = (s) => parseISO(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}
export function endDateFor(period, start, qty) {
  if (period === 'day') return addDaysISO(start, qty);
  if (period === 'week') return addDaysISO(start, 7 * qty);
  if (period === 'event') return addDaysISO(start, 1);
  const d = parseISO(start); d.setMonth(d.getMonth() + qty); return toISO(d);
}
export function fmtRange(b) {
  const last = addDaysISO(b.end_date, -1);
  return b.start_date === last ? fmtDay(b.start_date) : `${fmtDate(b.start_date, { month: 'short', day: 'numeric' })} – ${fmtDate(last, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
export function daysSummary(days) {
  const s = [...days].sort().join(',');
  if (s === '1,2,3,4,5') return 'Mon – Fri';
  if (s === '0,1,2,3,4,5,6') return 'Every day';
  if (s === '0,6') return 'Weekends';
  if (s === '1,2,3,4,5,6') return 'Mon – Sat';
  return [...days].sort().map((d) => DAY_NAMES[d]).join(', ');
}
export const timeAgo = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
export const clockTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export const STATUS = {
  awaiting_payment: { label: 'Awaiting payment', tone: 'warn' },
  payment_sent: { label: 'Payment sent', tone: 'info' },
  confirmed: { label: 'Confirmed', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};
export const statusPill = (s) => `<span class="pill pill-${STATUS[s].tone}">${STATUS[s].label}</span>`;

const PATHS = {
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  car: '<path d="M5 16.5v2M19 16.5v2M3.5 12.5 5.6 7.4A2 2 0 0 1 7.5 6h9a2 2 0 0 1 1.9 1.4l2.1 5.1"/><rect x="3" y="12" width="18" height="5" rx="1.8"/><circle cx="7.5" cy="14.5" r=".6" fill="currentColor"/><circle cx="16.5" cy="14.5" r=".6" fill="currentColor"/>',
  garage: '<path d="M3 10 12 4l9 6v10H3Z"/><path d="M7 20v-7h10v7M7 15.5h10M7 18h10"/>',
  lot: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"/>',
  dots: '<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.4 3 7.8 7 9.5 4-1.7 7-5.1 7-9.5V6Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  piggy: '<path d="M19 11c0-3.3-3.1-6-7-6S5 7.7 5 11c0 1.8.9 3.3 2.2 4.4V19h2.6l.6-1.7c.5.1 1 .2 1.6.2s1.1-.1 1.6-.2l.6 1.7h2.6v-3.6c.8-.6 1.4-1.4 1.8-2.4H21v-3h-2.1A5 5 0 0 0 19 11Z"/><path d="M10 8h3"/><circle cx="15.5" cy="10" r=".6" fill="currentColor"/>',
  home: '<path d="M4 11 12 4l8 7v9h-5.5v-5.5h-5V20H4Z"/>',
  list: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-2.5 2v-5.2A7.5 7.5 0 1 1 20 11.5Z"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.6 3.8-5.8 7.5-5.8s6.7 2.2 7.5 5.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  upload: '<path d="M7.5 18.5h-1a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 17.6 8a4.3 4.3 0 0 1-.6 10.5h-.5"/><path d="M12 12v8M9 15l3-3 3 3"/>',
  star: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8Z" fill="currentColor"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7Z"/><path d="m11 13 9-9"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="7.5" width="16.5" height="12" rx="2.5"/><path d="M16 13.5h1.5"/>',
  covered: '<path d="M3 10 12 4l9 6"/><path d="M6 12v8M18 12v8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  house: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  play: '<path d="M8 5.5v13l10-6.5Z"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
};
export const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;

export function toast(msg, tone = 'ok') {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  while (host.children.length >= 2) host.firstElementChild.remove();
  host.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3600);
}

export function modal(html, { onMount, label = 'Dialog' } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-close></div><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(label)}"><button class="icon-btn modal-x" data-close aria-label="Close">${icon('close')}</button>${html}</div>`;
  root.hidden = false;
  document.body.classList.add('no-scroll');
  const close = () => { root.hidden = true; root.innerHTML = ''; document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  onMount?.(root.querySelector('.modal'), close);
  root.querySelector('input, button:not(.modal-x)')?.focus();
  return close;
}

export const photoOf = (spot) => spot.photos?.[0] || `assets/spots/${spot.spot_type === 'garage' ? 'garage-1' : spot.spot_type === 'lot' ? 'lot-1' : 'driveway-1'}.svg`;

export function rating(spot) {
  return spot.rating ? `<span class="rating">${icon('star')} ${spot.rating.toFixed(1)} <span class="muted">(${spot.review_count})</span></span>` : '<span class="rating new">New</span>';
}

export function venmoLink(username, cents, note) {
  const u = encodeURIComponent(username);
  return `https://venmo.com/${u}?txn=pay&amount=${(cents / 100).toFixed(2)}&note=${encodeURIComponent(note)}`;
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('') || '?';
}

export function shrinkToDataUrl(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => reject(new Error('That photo couldn\'t be read. Try a JPG or PNG.'));
    img.src = URL.createObjectURL(file);
  });
}
