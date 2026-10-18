import { esc, icon, money, PERIODS, fmtRange, fmtTime, statusPill, venmoLink, photoOf, toast } from '../ui.js';
import { qrSvg } from '../vendor/qrcode.js';

export const live = true;

export default async function pay(view, { store, params, go, requireAuth }) {
  const u = await store.getUser() || await requireAuth('Sign in to see your booking.');
  if (!u) { go('/'); return; }
  const b = await store.getBooking(params[0]);
  if (!b) {
    view.innerHTML = `<section class="page narrow"><div class="card empty">${icon('calendar')}<h2>Booking not found</h2><p>It may belong to a different account.</p><a class="btn btn-primary" href="#/bookings">My bookings</a></div></section>`;
    return;
  }
  if (b.owner_id === u.id && b.renter_id !== u.id) { go('/host'); return; }

  const venmo = b.host?.venmo_username;
  const note = `Spotted parking ${b.ref_code}`;
  const demo = store.mode === 'demo';
  const payUrl = venmo ? venmoLink(venmo, b.total_cents, note) : null;
  // In demo mode the QR points at an explainer page instead of anyone's real Venmo.
  const qrTarget = demo ? `${location.origin}${location.pathname}#/demo-qr` : payUrl;
  const unit = PERIODS[b.period];

  const summary = `
    <div class="card card-pad">
      <div class="row" style="align-items:flex-start;gap:12px">
        <img src="${esc(photoOf(b.spot || {}))}" alt="" style="width:84px;height:66px;border-radius:10px;object-fit:cover" />
        <div class="spacer"><h3 style="margin:0">${esc(b.spot?.title || 'Parking spot')}</h3><div class="muted" style="font-size:.84rem;margin-bottom:4px">${esc(b.spot?.area || b.spot?.city || '')}</div>${statusPill(b.status)}</div>
      </div>
      <div style="margin-top:12px">
        <div class="summary-line"><span>Dates</span><b>${esc(fmtRange(b))}</b></div>
        ${b.spot ? `<div class="summary-line"><span>Hours</span><b>${fmtTime(b.spot.start_time)} – ${fmtTime(b.spot.end_time)}</b></div>` : ''}
        <div class="summary-line"><span>${b.quantity} × ${unit.unit}${b.quantity > 1 ? 's' : ''}</span><b>${money(b.total_cents / b.quantity, { decimals: 2 })} each</b></div>
        <div class="summary-line"><span>Booking code</span><b>${esc(b.ref_code)}</b></div>
        <div class="total-row"><span class="muted">Total</span><strong>${money(b.total_cents, { decimals: 2 })}</strong></div>
      </div>
      <div class="row" style="margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="msg">${icon('chat')} Message ${esc(b.host?.full_name?.split(' ')[0] || 'host')}</button>
        ${b.status !== 'cancelled' ? '<button class="btn-danger-text" id="cancel">Cancel booking</button>' : ''}
      </div>
    </div>`;

  let right = '';
  if (b.status === 'awaiting_payment') {
    right = venmo ? `
      <div class="card card-pad qr-box">
        <span class="venmo-badge">venmo</span>
        <h2 style="margin:0">Pay ${money(b.total_cents, { decimals: 2 })} to @${esc(venmo)}</h2>
        ${demo ? `<div class="notice notice-warn" style="text-align:left">${icon('info')}<div><strong>Demo mode: don't send money</strong><p>This QR opens a page explaining the demo. On the live site it opens the host's Venmo with the amount filled in.</p></div></div>` : ''}
        <div class="qr" aria-label="Venmo QR code">${qrSvg(qrTarget)}</div>
        <ol class="pay-steps">
          <li><span><b>Scan with your phone camera</b>${demo ? '' : ' or tap Open Venmo on your phone'}.</span></li>
          <li><span>Check that it's <b>@${esc(venmo)}</b> for <b>${money(b.total_cents, { decimals: 2 })}</b> with the note <b>${esc(b.ref_code)}</b>.</span></li>
          <li><span>After you pay, tap <b>I've sent the payment</b> below so the host can confirm.</span></li>
        </ol>
        <div class="copy-row" style="width:100%"><span class="muted" style="font-size:.84rem">Note</span><b style="font-size:.88rem">${esc(note)}</b><button class="btn btn-ghost btn-xs" id="copy">Copy</button></div>
        ${demo ? '' : `<a class="btn btn-outline btn-block" href="${esc(payUrl)}" target="_blank" rel="noopener">${icon('phone')} Open Venmo</a>`}
        <button class="btn btn-primary btn-block btn-lg" id="paid">I've sent the payment</button>
        <p class="fine" style="margin:0">Spotted doesn't process or hold payments. Payment goes straight to the host on Venmo.</p>
      </div>`
      : `<div class="card card-pad"><div class="notice notice-warn">${icon('info')}<div><strong>The host hasn't added a Venmo username yet</strong><p>Send them a message to sort out payment.</p></div></div></div>`;
  } else if (b.status === 'payment_sent') {
    right = `<div class="card card-pad stack">
      <div class="notice">${icon('clock')}<div><strong>Waiting for ${esc(b.host?.full_name || 'the host')} to confirm</strong><p>They'll check Venmo for ${money(b.total_cents, { decimals: 2 })} with note ${esc(b.ref_code)}. You'll see the address here once it's confirmed.</p></div></div>
      ${demo && b.spot?.is_sample ? '<p class="fine">Demo: the sample host confirms automatically in a few seconds.</p>' : ''}
    </div>`;
  } else if (b.status === 'confirmed') {
    right = `<div class="card card-pad stack">
      <div class="notice notice-ok">${icon('check')}<div><strong>You're all set!</strong><p>The host confirmed your payment.</p></div></div>
      <div><div class="label">Address</div><p style="font-size:1.05rem;color:var(--ink);font-weight:700;margin:4px 0 8px">${esc(b.address || 'Ask the host for the address')}</p>
      ${b.address ? `<a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}">${icon('pin')} Directions</a>` : ''}</div>
    </div>`;
  } else {
    right = `<div class="card card-pad"><div class="notice">${icon('info')}<div><strong>This booking was cancelled</strong><p>If you already paid, message the host to arrange a refund on Venmo.</p></div></div><a class="btn btn-primary btn-block" style="margin-top:14px" href="#/find">Find another spot</a></div>`;
  }

  view.innerHTML = `
  <section class="page">
    <a class="back" href="#/bookings">${icon('back')} My bookings</a>
    <div class="page-head"><h1>${b.status === 'awaiting_payment' ? 'Payment' : 'Your booking'}</h1></div>
    <div class="pay-grid">${summary}${right}</div>
  </section>`;

  view.querySelector('#copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(note); toast('Note copied'); } catch { toast('Couldn\'t copy. Type it in Venmo instead.', 'err'); }
  });
  view.querySelector('#paid')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await store.markPaymentSent(b.id); toast('Thanks! The host will confirm shortly.'); } catch (ex) { toast(ex.message, 'err'); e.target.disabled = false; }
  });
  view.querySelector('#cancel')?.addEventListener('click', async () => {
    if (!confirm('Cancel this booking?')) return;
    try { await store.cancelBooking(b.id); toast('Booking cancelled'); } catch (ex) { toast(ex.message, 'err'); }
  });
  view.querySelector('#msg')?.addEventListener('click', async () => {
    try { const id = await store.openConversation(b.spot_id); go(`/messages/${id}`); } catch (ex) { toast(ex.message, 'err'); }
  });
}
