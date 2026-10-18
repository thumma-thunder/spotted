import { esc, icon, money, fmtRange, statusPill, photoOf, todayISO } from '../ui.js';

export const live = true;
let tab = 'upcoming';

export default async function bookings(view, { store, requireAuth, rerender }) {
  const u = await store.getUser();
  if (!u) {
    view.innerHTML = `<section class="page narrow"><div class="page-head"><h1>My Bookings</h1></div>
      <div class="card empty">${icon('calendar')}<h3>Sign in to see your bookings</h3><p>Your parking reservations and payment status live here.</p><button class="btn btn-primary" id="si">Sign in</button></div></section>`;
    view.querySelector('#si').onclick = async () => { if (await requireAuth('Sign in to see your bookings.')) rerender(); };
    return;
  }
  const all = await store.myBookings();
  const today = todayISO();
  const upcoming = all.filter((b) => b.status !== 'cancelled' && b.end_date > today);
  const past = all.filter((b) => !upcoming.includes(b));
  const list = tab === 'upcoming' ? upcoming : past;

  view.innerHTML = `
  <section class="page narrow">
    <div class="page-head"><h1>My Bookings</h1><p>Parking you've reserved as a commuter.</p></div>
    <div class="seg" role="tablist" style="max-width:340px">
      <button role="tab" data-tab="upcoming" aria-selected="${tab === 'upcoming'}">Upcoming (${upcoming.length})</button>
      <button role="tab" data-tab="past" aria-selected="${tab === 'past'}">Past</button>
    </div>
    <div class="list-tight">
      ${list.length ? list.map((b) => `
        <div class="card booking">
          <img src="${esc(photoOf(b.spot || {}))}" alt="" />
          <div>
            <h3>${esc(b.spot?.title || 'Parking spot')}</h3>
            <div class="meta">${esc(fmtRange(b))} · ${money(b.total_cents, { decimals: 2 })}</div>
            <div style="margin-top:4px">${statusPill(b.status)}</div>
          </div>
          <div class="actions">
            ${b.status === 'awaiting_payment' ? `<a class="btn btn-primary btn-sm" href="#/pay/${b.id}">Pay with Venmo</a>` : `<a class="btn btn-ghost btn-sm" href="#/pay/${b.id}">${b.status === 'confirmed' ? 'View address' : 'Details'}</a>`}
            <button class="btn btn-ghost btn-sm" data-msg="${esc(b.spot_id)}" aria-label="Message host">${icon('chat')}</button>
          </div>
        </div>`).join('') : `<div class="card empty">${icon('car')}<h3>${tab === 'upcoming' ? 'No upcoming parking' : 'Nothing here yet'}</h3><p>Find a driveway near campus and book it in a minute.</p><a class="btn btn-primary" href="#/find">Find a spot</a></div>`}
    </div>
  </section>`;

  view.querySelectorAll('[data-tab]').forEach((t) => { t.onclick = () => { tab = t.dataset.tab; rerender(); }; });
  view.querySelectorAll('[data-msg]').forEach((btn) => {
    btn.onclick = async () => { const id = await store.openConversation(btn.dataset.msg); location.hash = `/messages/${id}`; };
  });
}
