// Demo store: the whole marketplace in this browser's localStorage.
// Used until Supabase keys are added to js/config.js. Same API as store-live.js.
import { SAMPLE_SPOTS, nextSaturdays } from './samples.js';
import { endDateFor, todayISO, parseISO, addDaysISO, shrinkToDataUrl } from './ui.js';
import { CONFIG } from './config.js';

const KEY = 'spotted.demo.v1';
const SETTINGS = { venmo_username: CONFIG.platformVenmo || 'david-thumma', fee_bps: CONFIG.feeBps ?? 800 };
const split = (total) => { const fee = Math.round(total * SETTINGS.fee_bps / 10000); return { fee_cents: fee, payout_cents: total - fee }; };
const SAMPLE_HOST = { id: 'sample-host', email: 'team@spotted.demo', full_name: 'Spotted Team', venmo_username: 'Spotted-Demo' };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const now = () => new Date().toISOString();

function seed() {
  const saturdays = nextSaturdays();
  const spots = [], addresses = {};
  SAMPLE_SPOTS.forEach((s, i) => {
    const id = `sample-${s.key}`;
    const { key, address, eventDates, ...rest } = s;
    spots.push({
      price_day_cents: null, price_week_cents: null, price_month_cents: null, price_event_cents: null,
      event_label: '', ...rest, id, owner_id: SAMPLE_HOST.id, status: 'active', is_sample: true,
      event_dates: eventDates === 'saturdays' ? saturdays : [], created_at: new Date(Date.now() - i * 864e5).toISOString(),
    });
    addresses[id] = address;
  });
  return { users: [SAMPLE_HOST], session: null, spots, addresses, bookings: [], conversations: [], messages: [] };
}

let db;
function load() {
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db || !db.spots) db = seed();
  // Older demo data predates spot locations: fill them in from the samples.
  db.spots.forEach((s) => {
    if (s.is_sample && s.lat == null) { const src = SAMPLE_SPOTS.find((x) => `sample-${x.key}` === s.id); if (src) { s.lat = src.lat; s.lng = src.lng; } }
  });
  db.bookings.forEach((b) => {
    if (b.payout_status === undefined) { Object.assign(b, split(b.total_cents)); b.payout_status = b.status === 'confirmed' ? 'owed' : 'not_due'; b.paid_out_at = null; }
  });
  // Keep sample game days in the future.
  const sats = nextSaturdays();
  db.spots.forEach((s) => { if (s.is_sample && s.event_dates.length && s.event_dates.every((d) => d < todayISO())) s.event_dates = sats; });
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked: keep in memory */ }
}
load();

const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
// Reload when another tab changes the demo data.
window.addEventListener('storage', (e) => { if (e.key === KEY) { load(); emit(); } });
const fail = (msg) => { throw new Error(msg); };
const me = () => db.users.find((u) => u.id === db.session) || null;
// In demo mode the team account is the Spotted admin.
const ADMIN_EMAIL = 'spottedparking@outlook.com';
const isAdmin = (u) => !!u && u.email === ADMIN_EMAIL;
const requireMe = () => me() || fail('Please sign in first.');
const pub = (u) => u && { id: u.id, full_name: u.full_name, venmo_username: u.venmo_username };

async function hash(s) {
  if (!crypto.subtle) return s;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const activeBooking = (b) => b.status === 'payment_sent' || b.status === 'confirmed'
  || (b.status === 'awaiting_payment' && Date.now() - new Date(b.created_at).getTime() < 30 * 60 * 1000);

function withHost(s) { return { ...s, host: pub(db.users.find((u) => u.id === s.owner_id)) }; }

function decorateBooking(b) {
  const spot = db.spots.find((s) => s.id === b.spot_id);
  const u = me();
  const canSeeAddress = u && (u.id === b.owner_id || isAdmin(u) || (u.id === b.renter_id && b.status === 'confirmed'));
  return {
    ...b,
    spot: spot && { id: spot.id, title: spot.title, area: spot.area, city: spot.city, photos: spot.photos, spot_type: spot.spot_type, start_time: spot.start_time, end_time: spot.end_time, is_sample: spot.is_sample },
    renter: pub(db.users.find((x) => x.id === b.renter_id)),
    host: pub(db.users.find((x) => x.id === b.owner_id)),
    address: canSeeAddress ? db.addresses[b.spot_id] : null,
  };
}

// The sample host answers on its own so the demo feels alive.
function sampleHostReact(kind, payload) {
  if (kind === 'paid') {
    setTimeout(() => {
      load();
      const b = db.bookings.find((x) => x.id === payload);
      if (b && b.status === 'payment_sent') {
        b.status = 'confirmed'; b.payout_status = 'owed'; b.updated_at = now(); save(); emit();
      }
    }, 2500);
  }
  if (kind === 'message') {
    setTimeout(() => {
      load();
      const c = db.conversations.find((x) => x.id === payload);
      if (!c) return;
      const spot = db.spots.find((s) => s.id === c.spot_id);
      const n = db.messages.filter((m) => m.conversation_id === c.id && m.sender_id === SAMPLE_HOST.id).length;
      const replies = [
        `Hi! Thanks for reaching out about ${spot?.title || 'the spot'}. Happy to help.`,
        'Sounds good! Pull all the way in so the sidewalk stays clear. Text here if anything comes up.',
        'No problem at all. See you then!',
      ];
      db.messages.push({ id: uid(), conversation_id: c.id, sender_id: SAMPLE_HOST.id, body: replies[Math.min(n, replies.length - 1)], created_at: now() });
      c.last_message_at = now(); save(); emit();
    }, 1600);
  }
}

export const store = {
  mode: 'demo',

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  async getUser() { const u = me(); return u && { id: u.id, email: u.email, full_name: u.full_name, venmo_username: u.venmo_username, is_admin: isAdmin(u) }; },
  async getSettings() { return SETTINGS; },

  async signUp({ name, email, password }) {
    email = email.trim().toLowerCase();
    if (db.users.some((u) => u.email === email)) fail('An account with that email already exists. Try signing in.');
    if (password.length < 6) fail('Use at least 6 characters for your password.');
    const u = { id: uid(), email, full_name: name.trim() || email.split('@')[0], venmo_username: null, pw: await hash(password) };
    db.users.push(u); db.session = u.id; save(); emit();
    return { needsConfirmation: false };
  },

  async signIn({ email, password }) {
    email = email.trim().toLowerCase();
    const u = db.users.find((x) => x.email === email);
    if (!u || u.pw !== await hash(password)) fail('That email and password don\'t match.');
    db.session = u.id; save(); emit();
  },

  async signOut() { db.session = null; save(); emit(); },

  async updateProfile({ full_name, venmo_username }) {
    const u = requireMe();
    if (venmo_username !== undefined) {
      const v = venmo_username ? venmo_username.replace(/^@/, '').trim() : null;
      if (v && !/^[A-Za-z0-9][A-Za-z0-9_-]{4,29}$/.test(v)) fail('Venmo usernames are 5–30 letters, numbers, - or _.');
      u.venmo_username = v;
    }
    if (full_name !== undefined) u.full_name = full_name.trim() || u.full_name;
    save(); emit();
  },

  async listSpots() {
    const u = me();
    return db.spots.filter((s) => s.status === 'active' || (u && s.owner_id === u.id)).map(withHost);
  },

  async bookedBetween(from, to) {
    return db.bookings.filter((b) => activeBooking(b) && b.start_date < to && b.end_date > from)
      .map(({ spot_id, start_date, end_date }) => ({ spot_id, start_date, end_date }));
  },

  async getSpot(id) {
    const s = db.spots.find((x) => x.id === id);
    const u = me();
    if (!s || (s.status !== 'active' && s.owner_id !== u?.id)) return null;
    return withHost(s);
  },

  async getAddress(spotId) {
    const u = me(); if (!u) return null;
    const s = db.spots.find((x) => x.id === spotId);
    const ok = s && (s.owner_id === u.id || db.bookings.some((b) => b.spot_id === spotId && b.renter_id === u.id && b.status === 'confirmed'));
    return ok ? db.addresses[spotId] : null;
  },

  async createSpot(data, address, photoFiles = []) {
    const u = requireMe();
    if (!u.venmo_username) fail('Add your Venmo username so Spotted can pay you.');
    const photos = [];
    for (const f of photoFiles.slice(0, 3)) photos.push(await shrinkToDataUrl(f, 640));
    const spot = { ...data, photos, id: uid(), owner_id: u.id, status: 'active', is_sample: false, rating: null, review_count: 0, created_at: now() };
    db.spots.unshift(spot); db.addresses[spot.id] = address; save(); emit();
    return spot;
  },

  async setSpotStatus(id, status) {
    const u = requireMe();
    const s = db.spots.find((x) => x.id === id && x.owner_id === u.id) || fail('Spot not found.');
    s.status = status; save(); emit();
  },

  async deleteSpot(id) {
    const u = requireMe();
    db.spots = db.spots.filter((x) => !(x.id === id && x.owner_id === u.id));
    db.bookings = db.bookings.filter((b) => b.spot_id !== id);
    const convIds = db.conversations.filter((c) => c.spot_id === id).map((c) => c.id);
    db.conversations = db.conversations.filter((c) => c.spot_id !== id);
    db.messages = db.messages.filter((m) => !convIds.includes(m.conversation_id));
    save(); emit();
  },

  async mySpots() {
    const u = requireMe();
    return db.spots.filter((s) => s.owner_id === u.id).map(withHost);
  },

  async createBooking({ spot_id, period, start_date, quantity }) {
    const u = requireMe();
    const s = db.spots.find((x) => x.id === spot_id && x.status === 'active') || fail('This spot is no longer available.');
    if (s.owner_id === u.id) fail('You can\'t book your own spot.');
    if (!s.rent_options.includes(period)) fail('This spot isn\'t offered that way.');
    if (!start_date || start_date < todayISO()) fail('Pick a start date from today on.');
    if (period === 'event') { if (!s.event_dates.includes(start_date)) fail('Pick one of the host\'s event dates.'); quantity = 1; }
    const end = endDateFor(period, start_date, quantity);
    if (period === 'day') {
      for (let d = start_date; d < end; d = addDaysISO(d, 1)) {
        if (!s.avail_days.includes(parseISO(d).getDay())) fail('The host doesn\'t offer this spot on one of those days.');
      }
    }
    const taken = db.bookings.filter((b) => b.spot_id === spot_id && activeBooking(b) && b.start_date < end && b.end_date > start_date).length;
    if (taken >= s.spot_count) fail('This spot is fully booked for those dates.');
    const b = {
      id: uid(), spot_id, renter_id: u.id, owner_id: s.owner_id, period, start_date, end_date: end, quantity,
      total_cents: s[`price_${period}_cents`] * quantity, ref_code: `SP-${uid().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      status: 'awaiting_payment', created_at: now(), updated_at: now(),
      payout_status: 'not_due', paid_out_at: null,
    };
    Object.assign(b, split(b.total_cents));
    db.bookings.unshift(b); save(); emit();
    return b;
  },

  async getBooking(id) {
    const u = requireMe();
    const b = db.bookings.find((x) => x.id === id && (x.renter_id === u.id || x.owner_id === u.id));
    return b ? decorateBooking(b) : null;
  },

  async myBookings() {
    const u = requireMe();
    return db.bookings.filter((b) => b.renter_id === u.id).map(decorateBooking);
  },

  async hostBookings() {
    const u = requireMe();
    return db.bookings.filter((b) => b.owner_id === u.id).map(decorateBooking);
  },

  async markPaymentSent(id) {
    const u = requireMe();
    const b = db.bookings.find((x) => x.id === id && x.renter_id === u.id && x.status === 'awaiting_payment') || fail('This booking can\'t be marked as paid.');
    b.status = 'payment_sent'; b.updated_at = now(); save(); emit();
    // Nobody is checking a real Venmo in the demo, so the "Spotted team" confirms sample bookings itself.
    if (db.spots.find((s) => s.id === b.spot_id)?.is_sample) sampleHostReact('paid', b.id);
  },

  async confirmPayment(id) {
    const u = requireMe();
    if (!isAdmin(u)) fail('Only the Spotted team can confirm payments.');
    const b = db.bookings.find((x) => x.id === id && ['awaiting_payment', 'payment_sent'].includes(x.status)) || fail('This booking can\'t be confirmed.');
    b.status = 'confirmed'; b.payout_status = 'owed'; b.updated_at = now(); save(); emit();
  },

  async markPaidOut(id) {
    const u = requireMe();
    if (!isAdmin(u)) fail('Only the Spotted team can record payouts.');
    const b = db.bookings.find((x) => x.id === id && x.status === 'confirmed' && x.payout_status === 'owed') || fail('This payout can\'t be marked as paid.');
    b.payout_status = 'paid'; b.paid_out_at = now(); b.updated_at = now(); save(); emit();
  },

  async allBookings() {
    const u = requireMe();
    if (!isAdmin(u)) fail('Only the Spotted team can see this page.');
    return db.bookings.map(decorateBooking);
  },

  async cancelBooking(id) {
    const u = requireMe();
    const b = db.bookings.find((x) => x.id === id && x.status !== 'cancelled' && x.payout_status !== 'paid'
      && ((x.renter_id === u.id && x.status === 'awaiting_payment') || x.owner_id === u.id || isAdmin(u)))
      || fail('This booking can\'t be cancelled here. Message the Spotted team for help.');
    b.status = 'cancelled'; b.payout_status = 'not_due'; b.updated_at = now(); save(); emit();
  },

  async openConversation(spotId, renterId = null) {
    const u = requireMe();
    const s = db.spots.find((x) => x.id === spotId) || fail('Spot not found.');
    let renter = u.id;
    if (s.owner_id === u.id) {
      renter = renterId;
      if (!renter || !(db.bookings.some((b) => b.spot_id === spotId && b.renter_id === renter) || db.conversations.some((c) => c.spot_id === spotId && c.renter_id === renter))) fail('You can only message renters of this spot.');
    }
    let c = db.conversations.find((x) => x.spot_id === spotId && x.renter_id === renter);
    if (!c) { c = { id: uid(), spot_id: spotId, renter_id: renter, owner_id: s.owner_id, last_message_at: now(), created_at: now() }; db.conversations.push(c); save(); }
    return c.id;
  },

  async myConversations() {
    const u = requireMe();
    return db.conversations.filter((c) => c.renter_id === u.id || c.owner_id === u.id)
      .map((c) => {
        const spot = db.spots.find((s) => s.id === c.spot_id);
        const otherId = c.renter_id === u.id ? c.owner_id : c.renter_id;
        const msgs = db.messages.filter((m) => m.conversation_id === c.id);
        return { ...c, spot: spot && { id: spot.id, title: spot.title, photos: spot.photos, spot_type: spot.spot_type }, other: pub(db.users.find((x) => x.id === otherId)), role: c.owner_id === u.id ? 'host' : 'renter', last: msgs[msgs.length - 1] || null };
      })
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  },

  async getMessages(convId) {
    const u = requireMe();
    const c = db.conversations.find((x) => x.id === convId && [x.renter_id, x.owner_id].includes(u.id)) || fail('Conversation not found.');
    return db.messages.filter((m) => m.conversation_id === c.id);
  },

  async sendMessage(convId, body) {
    const u = requireMe();
    const c = db.conversations.find((x) => x.id === convId && [x.renter_id, x.owner_id].includes(u.id)) || fail('Conversation not found.');
    body = body.trim(); if (!body) return;
    db.messages.push({ id: uid(), conversation_id: c.id, sender_id: u.id, body: body.slice(0, 2000), created_at: now() });
    c.last_message_at = now(); save(); emit();
    if (c.owner_id === SAMPLE_HOST.id) sampleHostReact('message', c.id);
  },

  async resetDemo() { db = seed(); save(); emit(); },
};
