import { esc, icon, money, PERIODS, priceCents, fmtRange, statusPill, photoOf, initials, daysSummary, fmtTime, modal, toast } from '../ui.js';

export const live = true;

export function venmoDialog(store, user, onSaved) {
  modal(`
    <h2 class="modal-title">Your Venmo</h2>
    <p class="muted modal-sub">Commuters pay you here. Use the username on your Venmo profile, without the @.</p>
    <form class="form" id="vf">
      <label class="field"><span>Venmo username</span><div class="prefix"><b>@</b><input name="venmo" value="${esc(user.venmo_username || '')}" placeholder="Alex-Rivera" autocomplete="off" required /></div></label>
      <p class="form-error" hidden></p>
      <button class="btn btn-primary btn-block">Save</button>
    </form>`, {
    label: 'Venmo username',
    onMount(el, close) {
      const f = el.querySelector('#vf');
      f.onsubmit = async (e) => {
        e.preventDefault();
        try { await store.updateProfile({ venmo_username: f.venmo.value }); close(); toast('Venmo saved'); onSaved?.(); } catch (ex) { const er = f.querySelector('.form-error'); er.textContent = ex.message; er.hidden = false; }
      };
    },
  });
}

export default async function host(view, { store, requireAuth, rerender, go }) {
  const u = await store.getUser();
  if (!u) {
    view.innerHTML = `<section class="page narrow">
      <div class="card card-pad empty" style="padding:36px 22px">${icon('house')}
        <h1 style="font-size:1.6rem">Your driveway. Their spot.</h1>
        <p>List a driveway, garage or lot near campus. Set your own schedule and price, and get paid on Venmo.</p>
        <div class="row" style="justify-content:center;flex-wrap:wrap"><a class="btn btn-primary" href="#/list">List your spot</a><button class="btn btn-ghost" id="si">Sign in to your dashboard</button></div>
      </div></section>`;
    view.querySelector('#si').onclick = async () => { if (await requireAuth('Sign in to manage your spots.')) rerender(); };
    return;
  }

  const [spots, bookings] = await Promise.all([store.mySpots(), store.hostBookings()]);
  const needs = bookings.filter((b) => b.status === 'payment_sent' || b.status === 'awaiting_payment');
  const recent = bookings.filter((b) => !needs.includes(b)).slice(0, 8);
  const statsFor = (id) => {
    const bs = bookings.filter((b) => b.spot_id === id && b.status !== 'cancelled');
    return { count: bs.length, earned: bs.filter((b) => b.status === 'confirmed').reduce((a, b) => a + b.total_cents, 0) };
  };

  const bookingRow = (b, attention) => `
    <div class="card booking ${attention ? 'request' : ''}">
      <span class="avatar" style="width:52px;height:52px">${esc(initials(b.renter?.full_name))}</span>
      <div>
        <h3>${esc(b.renter?.full_name || 'Commuter')}</h3>
        <div class="meta">${esc(b.spot?.title || '')} · ${esc(fmtRange(b))}</div>
        <div class="meta"><b style="color:var(--ink)">${money(b.total_cents, { decimals: 2 })}</b> · note ${esc(b.ref_code)}</div>
        <div style="margin-top:4px">${statusPill(b.status)}</div>
      </div>
      <div class="actions">
        ${attention ? `<button class="btn btn-ok btn-sm" data-confirm="${b.id}">${icon('check')} Payment received</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-chat="${b.spot_id}|${b.renter_id}" aria-label="Message renter">${icon('chat')}</button>
        ${b.status !== 'cancelled' ? `<button class="btn-danger-text" data-cancel="${b.id}">Cancel</button>` : ''}
      </div>
    </div>`;

  view.innerHTML = `
  <section class="page">
    <div class="hello"><span class="avatar">${esc(initials(u.full_name))}</span><div><h1>Hi, ${esc(u.full_name.split(' ')[0])}!</h1><p>Here's your listing and recent activity.</p></div></div>

    <div class="card payout-card">
      <span class="ico">${icon('wallet')}</span>
      <div class="spacer">
        <h3>Payouts ${u.venmo_username ? `to @${esc(u.venmo_username)}` : ''}</h3>
        <p>${u.venmo_username ? 'Commuters pay you directly on Venmo. Confirm each payment below once it shows up.' : 'Add your Venmo username so commuters can pay you.'}</p>
      </div>
      <button class="btn ${u.venmo_username ? 'btn-outline' : 'btn-primary'} btn-xs" id="venmo">${u.venmo_username ? 'Edit' : 'Add Venmo'}</button>
    </div>

    <div class="host-grid">
      <div>
        <div class="section-title"><h2>Your Listings</h2><a class="btn btn-primary btn-sm" href="#/list">${icon('plus')} Add New Spot</a></div>
        <div class="list-tight">
          ${spots.length ? spots.map((s) => {
            const st = statsFor(s.id);
            return `<div class="card listing">
              <img src="${esc(photoOf(s))}" alt="" />
              <div>
                <a href="#/spot/${s.id}" style="color:inherit"><h3>${esc(s.title)}</h3></a>
                <div class="meta">${s.rent_options.map((p) => `${money(priceCents(s, p))}${PERIODS[p].short}`).join(' · ')}${s.distance_mi != null ? ` · ${s.distance_mi} mi from CU` : ''}</div>
                <div class="meta">Available: ${esc(daysSummary(s.avail_days))}, ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}</div>
                <div style="margin-top:4px"><span class="status-dot ${s.status === 'active' ? 'on' : 'off'}">${s.status === 'active' ? 'Active' : 'Paused'}</span></div>
              </div>
              <div class="stats">
                <div><b>${st.count}</b><span>Total Bookings</span></div>
                <div><b>${money(st.earned)}</b><span>Total Earnings</span></div>
                <div class="spacer"></div>
                <button class="btn btn-ghost btn-xs" data-toggle="${s.id}" data-status="${s.status}">${icon(s.status === 'active' ? 'pause' : 'play')} ${s.status === 'active' ? 'Pause' : 'Resume'}</button>
                <button class="icon-btn" data-delete="${s.id}" aria-label="Delete ${esc(s.title)}" title="Delete">${icon('trash')}</button>
              </div>
            </div>`;
          }).join('') : `<div class="card empty">${icon('house')}<h3>No spots listed yet</h3><p>It takes about two minutes. You choose the days, hours and price.</p><a class="btn btn-primary" href="#/list">List your first spot</a></div>`}
        </div>
      </div>
      <div>
        ${needs.length ? `<div class="section-title"><h2>Needs your attention</h2><span class="pill pill-info">${needs.length}</span></div>
          <p class="muted" style="font-size:.85rem;margin-top:-6px">Check Venmo for the amount and note, then confirm. Confirming shares the address with the renter.</p>
          <div class="list-tight">${needs.map((b) => bookingRow(b, true)).join('')}</div>` : ''}
        <div class="section-title"><h2>Recent Bookings</h2></div>
        <div class="list-tight">${recent.length ? recent.map((b) => bookingRow(b, false)).join('') : '<div class="card card-pad muted" style="font-size:.9rem">Bookings will show up here.</div>'}</div>
      </div>
    </div>
  </section>`;

  view.querySelector('#venmo').onclick = () => venmoDialog(store, u, rerender);
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(e.message, 'err'); } };
  view.querySelectorAll('[data-confirm]').forEach((b) => { b.onclick = () => act(() => store.confirmPayment(b.dataset.confirm), 'Payment confirmed. The renter can now see the address.'); });
  view.querySelectorAll('[data-cancel]').forEach((b) => { b.onclick = () => confirm('Cancel this booking? If they already paid, refund them on Venmo.') && act(() => store.cancelBooking(b.dataset.cancel), 'Booking cancelled'); });
  view.querySelectorAll('[data-toggle]').forEach((b) => { b.onclick = () => act(() => store.setSpotStatus(b.dataset.toggle, b.dataset.status === 'active' ? 'paused' : 'active'), b.dataset.status === 'active' ? 'Spot paused. It won\'t show in search.' : 'Spot is live again'); });
  view.querySelectorAll('[data-delete]').forEach((b) => { b.onclick = () => confirm('Delete this spot and its bookings? This can\'t be undone.') && act(() => store.deleteSpot(b.dataset.delete), 'Spot deleted'); });
  view.querySelectorAll('[data-chat]').forEach((b) => {
    b.onclick = () => act(async () => { const [spotId, renterId] = b.dataset.chat.split('|'); go(`/messages/${await store.openConversation(spotId, renterId)}`); });
  });
}
