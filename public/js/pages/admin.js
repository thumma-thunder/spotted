// Spotted team page: confirm commuter payments and pay out spot owners.
import { esc, icon, money, fmtRange, statusPill, venmoLink, toast, timeAgo } from '../ui.js';
import { qrSvg } from '../vendor/qrcode.js';

export const live = true;

export default async function admin(view, { store, requireAuth, rerender }) {
  const u = await store.getUser() || await requireAuth('Sign in with a Spotted team account.');
  if (!u) { location.hash = '/'; return; }
  if (!u.is_admin) {
    view.innerHTML = `<section class="page narrow"><div class="card empty">${icon('shield')}<h2>Team only</h2><p>This page is for the Spotted team.</p><a class="btn btn-primary" href="#/">Back home</a></div></section>`;
    return;
  }

  const [all, settings] = await Promise.all([store.allBookings(), store.getSettings()]);
  const toCheck = all.filter((b) => b.status === 'payment_sent');
  const unpaid = all.filter((b) => b.status === 'awaiting_payment');
  const owed = all.filter((b) => b.status === 'confirmed' && b.payout_status === 'owed');
  const paid = all.filter((b) => b.payout_status === 'paid');
  const confirmed = all.filter((b) => b.status === 'confirmed');
  const sum = (bs, k) => bs.reduce((a, b) => a + b[k], 0);
  const m = (c) => money(c, { decimals: 2 });

  // Group payouts by owner so the team sends one Venmo per person.
  const byOwner = new Map();
  owed.forEach((b) => {
    const k = b.owner_id;
    if (!byOwner.has(k)) byOwner.set(k, { host: b.host, items: [] });
    byOwner.get(k).items.push(b);
  });

  const checkRow = (b) => `
    <div class="card booking request">
      <div class="ref-chip">${esc(b.ref_code)}</div>
      <div>
        <h3>${m(b.total_cents)} from ${esc(b.renter?.full_name || 'Commuter')}</h3>
        <div class="meta">${esc(b.spot?.title || '')} · ${esc(fmtRange(b))}</div>
        <div class="meta">Marked paid ${timeAgo(b.updated_at)} · look for note <b>${esc(b.ref_code)}</b> in @${esc(settings.venmo_username)}</div>
      </div>
      <div class="actions">
        <button class="btn btn-ok btn-sm" data-confirm="${b.id}">${icon('check')} Payment received</button>
        <button class="btn-danger-text" data-cancel="${b.id}">Cancel</button>
      </div>
    </div>`;

  const ownerCard = ({ host, items }, idx) => {
    const total = sum(items, 'payout_cents');
    const refs = items.map((b) => b.ref_code).join(' ');
    const note = `Spotted payout ${refs}`.slice(0, 200);
    // Demo mode never links to a real person's Venmo.
    const link = !host?.venmo_username ? null
      : store.mode === 'demo' ? `${location.origin}${location.pathname}#/demo-qr`
      : venmoLink(host.venmo_username, total, note);
    return `
    <div class="card card-pad payout-owner">
      <div class="row" style="align-items:flex-start;flex-wrap:wrap">
        <div class="spacer">
          <h3 style="margin:0">Pay ${esc(host?.full_name || 'Owner')} ${m(total)}</h3>
          <div class="meta">${host?.venmo_username ? `Venmo <b>@${esc(host.venmo_username)}</b>` : '<span style="color:var(--danger)">No Venmo on file. Message them.</span>'} · ${items.length} booking${items.length > 1 ? 's' : ''}</div>
        </div>
        ${link ? `<button class="btn btn-ghost btn-xs" data-qr="${idx}">${icon('qr')} Show QR</button><a class="btn btn-outline btn-xs" href="${esc(link)}" target="_blank" rel="noopener">${icon('phone')} Open Venmo</a>` : ''}
      </div>
      <div class="qr-inline" id="qr-${idx}" hidden>${link ? `<div class="qr">${qrSvg(link)}</div><p class="fine">Note: ${esc(note)}</p>` : ''}</div>
      <div class="payout-lines">
        ${items.map((b) => `<div class="payout-line"><span><b>${esc(b.ref_code)}</b> · ${esc(b.spot?.title || '')} · ${esc(fmtRange(b))}</span><span>${m(b.total_cents)} − ${m(b.fee_cents)} fee = <b>${m(b.payout_cents)}</b></span></div>`).join('')}
      </div>
      <button class="btn btn-primary btn-sm" data-paid="${items.map((b) => b.id).join(',')}" style="margin-top:12px">${icon('check')} I sent ${m(total)} on Venmo</button>
    </div>`;
  };

  view.innerHTML = `
  <section class="page">
    <div class="page-head"><h1>Spotted Team</h1><p>Payments come in to <b>@${esc(settings.venmo_username)}</b>. Spotted keeps ${settings.fee_bps / 100}% and pays owners the rest.</p></div>

    <div class="stat-grid">
      <div class="card stat"><span>Collected</span><b>${m(sum(confirmed, 'total_cents'))}</b></div>
      <div class="card stat"><span>Spotted's fees</span><b>${m(sum(confirmed, 'fee_cents'))}</b></div>
      <div class="card stat"><span>Owed to owners</span><b>${m(sum(owed, 'payout_cents'))}</b></div>
      <div class="card stat"><span>Paid to owners</span><b>${m(sum(paid, 'payout_cents'))}</b></div>
    </div>

    <div class="section-title"><h2>1. Check Venmo</h2><span class="pill pill-info">${toCheck.length}</span></div>
    <p class="muted" style="font-size:.86rem;margin-top:-6px">These commuters say they paid. Find the booking code in Spotted's Venmo, then confirm. Confirming sends them the address.</p>
    <div class="list-tight">${toCheck.length ? toCheck.map(checkRow).join('') : '<div class="card card-pad muted" style="font-size:.9rem">Nothing to check right now.</div>'}</div>

    <div class="section-title"><h2>2. Pay owners</h2><span class="pill pill-info">${byOwner.size}</span></div>
    <p class="muted" style="font-size:.86rem;margin-top:-6px">One Venmo per owner covers all their confirmed bookings. Tap the button after you send it.</p>
    <div class="list-tight">${byOwner.size ? [...byOwner.values()].map(ownerCard).join('') : '<div class="card card-pad muted" style="font-size:.9rem">No payouts owed.</div>'}</div>

    ${unpaid.length ? `<div class="section-title"><h2>Booked, not paid yet</h2><span class="pill pill-muted">${unpaid.length}</span></div>
    <p class="muted" style="font-size:.86rem;margin-top:-6px">These hold the spot for 30 minutes. Cancel any that were abandoned.</p>
    <div class="list-tight">${unpaid.map((b) => `<div class="card booking"><div class="ref-chip">${esc(b.ref_code)}</div><div><h3>${m(b.total_cents)} · ${esc(b.renter?.full_name || 'Commuter')}</h3><div class="meta">${esc(b.spot?.title || '')} · ${esc(fmtRange(b))} · booked ${timeAgo(b.created_at)}</div></div><div class="actions"><button class="btn btn-ok btn-sm" data-confirm="${b.id}">${icon('check')} Payment received</button><button class="btn-danger-text" data-cancel="${b.id}">Cancel</button></div></div>`).join('')}</div>` : ''}

    <div class="section-title"><h2>History</h2></div>
    <div class="card card-pad history">
      ${all.length ? all.slice(0, 40).map((b) => `<div class="payout-line"><span><b>${esc(b.ref_code)}</b> · ${esc(b.renter?.full_name || '')} → ${esc(b.host?.full_name || '')} · ${esc(b.spot?.title || '')}</span><span>${m(b.total_cents)} ${b.payout_status === 'paid' ? '<span class="pill pill-ok">Paid out</span>' : statusPill(b.status)}</span></div>`).join('') : '<span class="muted">No bookings yet.</span>'}
    </div>
  </section>`;

  const act = async (fn, msg) => { try { await fn(); toast(msg); rerender(); } catch (e) { toast(e.message, 'err'); } };
  view.querySelectorAll('[data-confirm]').forEach((b) => { b.onclick = () => act(() => store.confirmPayment(b.dataset.confirm), 'Payment confirmed. The commuter now has the address.'); });
  view.querySelectorAll('[data-cancel]').forEach((b) => {
    b.onclick = () => confirm('Cancel this booking? If they already paid, refund them from Spotted\'s Venmo.') && act(() => store.cancelBooking(b.dataset.cancel), 'Booking cancelled');
  });
  view.querySelectorAll('[data-qr]').forEach((b) => { b.onclick = () => { const el = view.querySelector(`#qr-${b.dataset.qr}`); el.hidden = !el.hidden; }; });
  view.querySelectorAll('[data-paid]').forEach((b) => {
    b.onclick = () => act(async () => { for (const id of b.dataset.paid.split(',')) await store.markPaidOut(id); }, 'Payout recorded. The owner can see it on their dashboard.');
  });
}
