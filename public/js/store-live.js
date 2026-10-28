// Live store backed by Supabase (free plan): Postgres + Auth + Storage.
// Same API as store-demo.js. Loaded only when js/config.js has keys.
import { shrinkToDataUrl } from './ui.js';

export async function createLiveStore({ supabaseUrl, supabaseKey }) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });

  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  let user = null;

  const friendly = (error) => {
    const m = error?.message || 'Something went wrong. Please try again.';
    if (/row-level security|permission denied/i.test(m)) return new Error('You don\'t have permission to do that.');
    if (/Invalid login credentials/i.test(m)) return new Error('That email and password don\'t match.');
    if (/Email not confirmed/i.test(m)) return new Error('Please confirm your email first. Check your inbox for the link.');
    if (/User already registered/i.test(m)) return new Error('An account with that email already exists. Try signing in.');
    if (/venmo_username_check/i.test(m)) return new Error('Venmo usernames are 5–30 letters, numbers, - or _.');
    return new Error(m);
  };
  const run = async (p) => { const { data, error } = await p; if (error) throw friendly(error); return data; };

  async function loadProfile(sessionUser) {
    if (!sessionUser) { user = null; return; }
    const [{ data }, { data: admin }] = await Promise.all([
      sb.from('profiles').select('id, full_name, venmo_username').eq('id', sessionUser.id).maybeSingle(),
      sb.rpc('is_admin'),
    ]);
    user = { id: sessionUser.id, email: sessionUser.email, full_name: data?.full_name || sessionUser.email, venmo_username: data?.venmo_username || null, is_admin: !!admin };
  }
  let settings = null;

  const { data: { session } } = await sb.auth.getSession();
  await loadProfile(session?.user);
  sb.auth.onAuthStateChange((_event, s) => {
    // Defer: Supabase recommends not awaiting other calls inside this callback.
    setTimeout(async () => { await loadProfile(s?.user); emit(); }, 0);
  });

  const requireUser = () => { if (!user) throw new Error('Please sign in first.'); return user; };
  const PROFILE = 'id, full_name, venmo_username';
  const SPOT = `*, host:profiles!spots_owner_id_fkey(${PROFILE})`;
  const BOOKING = `*, spot:spots(id, title, area, city, photos, spot_type, start_time, end_time, is_sample),
    renter:profiles!bookings_renter_id_fkey(${PROFILE}), host:profiles!bookings_owner_id_fkey(${PROFILE})`;

  async function withAddresses(bookings) {
    const ids = [...new Set(bookings.map((b) => b.spot_id))];
    if (!ids.length) return bookings;
    const rows = await run(sb.from('spot_addresses').select('spot_id, street_address').in('spot_id', ids));
    const map = Object.fromEntries(rows.map((r) => [r.spot_id, r.street_address]));
    return bookings.map((b) => ({
      ...b,
      address: (b.owner_id === user?.id || b.status === 'confirmed') ? map[b.spot_id] || null : null,
    }));
  }

  const store = {
    mode: 'live',
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async getUser() { return user; },
    async getSettings() {
      if (!settings) {
        const row = await run(sb.from('platform_settings').select('venmo_username, fee_bps').maybeSingle());
        settings = row || { venmo_username: 'david-thumma', fee_bps: 800 };
      }
      return settings;
    },

    async signUp({ name, email, password }) {
      const data = await run(sb.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: location.origin + location.pathname },
      }));
      return { needsConfirmation: !data.session };
    },
    async signIn({ email, password }) { await run(sb.auth.signInWithPassword({ email: email.trim(), password })); await loadProfile((await sb.auth.getUser()).data.user); emit(); },
    async signOut() { await sb.auth.signOut(); user = null; emit(); },

    async updateProfile({ full_name, venmo_username }) {
      const u = requireUser();
      const patch = {};
      if (full_name !== undefined) patch.full_name = full_name.trim();
      if (venmo_username !== undefined) {
        const v = venmo_username ? venmo_username.replace(/^@/, '').trim() : null;
        if (v && !/^[A-Za-z0-9][A-Za-z0-9_-]{4,29}$/.test(v)) throw new Error('Venmo usernames are 5–30 letters, numbers, - or _.');
        patch.venmo_username = v;
      }
      await run(sb.from('profiles').update(patch).eq('id', u.id));
      Object.assign(user, patch); emit();
    },

    async listSpots() { return run(sb.from('spots').select(SPOT).order('created_at', { ascending: false }).limit(500)); },
    async bookedBetween(from, to) { return run(sb.rpc('spot_bookings_between', { p_from: from, p_to: to })); },
    async getSpot(id) { return run(sb.from('spots').select(SPOT).eq('id', id).maybeSingle()); },
    async getAddress(spotId) {
      if (!user) return null;
      const row = await run(sb.from('spot_addresses').select('street_address').eq('spot_id', spotId).maybeSingle());
      return row?.street_address || null;
    },

    async createSpot(data, address, photoFiles = []) {
      const u = requireUser();
      if (!u.venmo_username) throw new Error('Add your Venmo username so Spotted can pay you.');
      const photos = [];
      for (const f of photoFiles.slice(0, 5)) {
        const dataUrl = await shrinkToDataUrl(f, 1280);
        const blob = await (await fetch(dataUrl)).blob();
        const path = `${u.id}/${crypto.randomUUID()}.jpg`;
        await run(sb.storage.from('spot-photos').upload(path, blob, { contentType: 'image/jpeg' }));
        photos.push(sb.storage.from('spot-photos').getPublicUrl(path).data.publicUrl);
      }
      const spot = await run(sb.from('spots').insert({ ...data, photos, owner_id: u.id }).select().single());
      await run(sb.from('spot_addresses').insert({ spot_id: spot.id, street_address: address }));
      emit();
      return spot;
    },
    async setSpotStatus(id, status) { await run(sb.from('spots').update({ status }).eq('id', id)); emit(); },
    async deleteSpot(id) { await run(sb.from('spots').delete().eq('id', id)); emit(); },
    async mySpots() { const u = requireUser(); return run(sb.from('spots').select(SPOT).eq('owner_id', u.id).order('created_at', { ascending: false })); },

    async createBooking({ spot_id, period, start_date, quantity }) {
      requireUser();
      const b = await run(sb.rpc('create_booking', { p_spot_id: spot_id, p_period: period, p_start: start_date, p_quantity: quantity }));
      emit(); return b;
    },
    async getBooking(id) {
      requireUser();
      const b = await run(sb.from('bookings').select(BOOKING).eq('id', id).maybeSingle());
      return b ? (await withAddresses([b]))[0] : null;
    },
    async myBookings() { const u = requireUser(); return withAddresses(await run(sb.from('bookings').select(BOOKING).eq('renter_id', u.id).order('created_at', { ascending: false }))); },
    async hostBookings() { const u = requireUser(); return withAddresses(await run(sb.from('bookings').select(BOOKING).eq('owner_id', u.id).order('created_at', { ascending: false }))); },
    async markPaymentSent(id) { await run(sb.rpc('mark_payment_sent', { p_booking_id: id })); emit(); },
    async confirmPayment(id) { await run(sb.rpc('confirm_payment', { p_booking_id: id })); emit(); },
    async ownerConfirm(id) { await run(sb.rpc('owner_confirm_booking', { p_booking_id: id })); emit(); },
    async markPaidOut(id) { await run(sb.rpc('mark_paid_out', { p_booking_id: id })); emit(); },
    async markRefunded(id) { await run(sb.rpc('mark_refunded', { p_booking_id: id })); emit(); },
    async allBookings() {
      if (!user?.is_admin) throw new Error('Only the Spotted team can see this page.');
      return run(sb.from('bookings').select(BOOKING).order('created_at', { ascending: false }).limit(500));
    },
    async cancelBooking(id) { await run(sb.rpc('cancel_booking', { p_booking_id: id })); emit(); },

    async openConversation(spotId, renterId = null) {
      requireUser();
      return run(sb.rpc('open_conversation', { p_spot_id: spotId, p_renter_id: renterId }));
    },
    async myConversations() {
      const u = requireUser();
      const convs = await run(sb.from('conversations').select(`*, spot:spots(id, title, photos, spot_type),
        renter:profiles!conversations_renter_id_fkey(${PROFILE}), owner:profiles!conversations_owner_id_fkey(${PROFILE})`)
        .order('last_message_at', { ascending: false }));
      const last = {};
      if (convs.length) {
        const msgs = await run(sb.from('messages').select('*').in('conversation_id', convs.map((c) => c.id)).order('created_at', { ascending: false }).limit(300));
        msgs.forEach((m) => { if (!last[m.conversation_id]) last[m.conversation_id] = m; });
      }
      return convs.map((c) => ({ ...c, other: c.owner_id === u.id ? c.renter : c.owner, role: c.owner_id === u.id ? 'host' : 'renter', last: last[c.id] || null }));
    },
    async getMessages(convId) { requireUser(); return run(sb.from('messages').select('*').eq('conversation_id', convId).order('created_at').limit(500)); },
    async sendMessage(convId, body) {
      const u = requireUser();
      body = body.trim(); if (!body) return;
      await run(sb.from('messages').insert({ conversation_id: convId, sender_id: u.id, body: body.slice(0, 2000) }));
      emit();
    },
  };
  return store;
}
