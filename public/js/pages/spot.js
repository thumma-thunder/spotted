import { buildingByCode, milesBetween } from '../buildings-picker.js';
import { spotPoint } from '../geo.js';
import { esc, icon, money, PERIODS, MAX_QTY, SPOT_TYPES, priceCents, todayISO, parseISO, endDateFor, addDaysISO, fmtDay, fmtDate, fmtTime, daysSummary, photoOf, rating, toast, initials, DAY_NAMES } from '../ui.js';

export default async function spot(view, { store, params, query, go, requireAuth, user }) {
  const s = await store.getSpot(decodeURIComponent(params[0]));
  if (!s) {
    view.innerHTML = `<section class="page narrow"><div class="card empty">${icon('search')}<h2>This spot isn't available</h2><p>The host may have paused or removed it.</p><a class="btn btn-primary" href="#/find">Find another spot</a></div></section>`;
    return;
  }
  const isOwner = user && user.id === s.owner_id;
  const upcomingGames = (s.event_dates || []).filter((d) => d >= todayISO()).sort();
  const state = {
    period: s.rent_options.includes(query.period) ? query.period : s.rent_options[0],
    date: query.date && query.date >= todayISO() ? query.date : todayISO(),
    qty: 1,
  };
  // Start on the first date the host actually offers.
  const nextOpenDay = (from) => { let d = from; for (let i = 0; i < 14 && !s.avail_days.includes(parseISO(d).getDay()); i++) d = addDaysISO(d, 1); return d; };
  if (state.period === 'event' && !upcomingGames.includes(state.date)) state.date = upcomingGames[0] || '';
  if (state.period === 'day') state.date = nextOpenDay(state.date);
  const photos = s.photos?.length ? s.photos : [photoOf(s)];
  const near = buildingByCode(query.near);
  const pt = spotPoint(s);
  const nearLine = near && pt ? `<div class="tag" style="margin-top:2px">${icon('car')} About ${milesBetween(pt, near).toFixed(1)} mi to ${esc(near.name)}</div>` : '';

  view.innerHTML = `
  <section class="page page-spot">
    <a class="back" href="#/find${query.near ? `?near=${encodeURIComponent(query.near)}` : ''}">${icon('back')} Back to results</a>
    <div class="spot-layout">
      <div>
        <div class="gallery">
          <img id="main-photo" src="${esc(photos[0])}" alt="Photo of ${esc(s.title)}" />
          ${s.is_sample ? '<span class="sample-badge">Sample listing</span>' : ''}
          ${photos.length > 1 ? `<div class="thumbs-row">${photos.map((p, i) => `<button type="button" data-photo="${i}" aria-pressed="${i === 0}" aria-label="Photo ${i + 1}"><img src="${esc(p)}" alt="" /></button>`).join('')}</div>` : ''}
        </div>
        <div class="spot-title">
          <div>
            <h1>${esc(s.title)}</h1>
            <div class="tag">${icon('pin')} ${s.distance_mi != null ? `${s.distance_mi} mi from CU · ` : ''}${esc(s.area ? `${s.area}, ${s.city}` : s.city)}</div>
            ${nearLine}
          </div>
          ${rating(s)}
        </div>
        <div class="tags" style="margin-top:10px">
          <span class="tag">${icon(s.covered ? 'covered' : 'sun')} ${s.covered ? 'Covered' : 'Outdoor'}</span>
          <span class="tag">${icon(SPOT_TYPES[s.spot_type].icon)} ${SPOT_TYPES[s.spot_type].label}</span>
          ${s.spot_count > 1 ? `<span class="tag">${icon('car')} ${s.spot_count} spaces</span>` : ''}
        </div>
        <div class="price-list">${s.rent_options.map((p) => `<span>${money(priceCents(s, p))}${PERIODS[p].short}</span>`).join('')}</div>

        <div class="card card-pad" style="margin-top:16px">
          <h3>Availability</h3>
          <dl class="kv">
            <dt>${esc(daysSummary(s.avail_days))}</dt><dd>${fmtTime(s.start_time)} – ${fmtTime(s.end_time)}</dd>
            ${[0, 1, 2, 3, 4, 5, 6].filter((d) => !s.avail_days.includes(d)).length && s.avail_days.length < 7 ? `<dt>${esc([0, 1, 2, 3, 4, 5, 6].filter((d) => !s.avail_days.includes(d)).map((d) => DAY_NAMES[d]).join(', '))}</dt><dd>Not available</dd>` : ''}
            ${s.rent_options.includes('event') ? `<dt>${esc(s.event_label || 'Event days')}</dt><dd>${upcomingGames.length ? upcomingGames.map((d) => fmtDate(d, { month: 'short', day: 'numeric' })).join(', ') : 'No upcoming dates'}</dd>` : ''}
          </dl>
          ${s.description ? `<h3 style="margin-top:16px">Description</h3><p class="muted" style="margin:0">${esc(s.description)}</p>` : ''}
        </div>

        <div class="card card-pad host-row" style="margin-top:12px">
          <span class="avatar">${esc(initials(s.host?.full_name))}</span>
          <div class="spacer"><strong style="color:var(--ink)">${esc(s.host?.full_name || 'Spotted host')}</strong><div class="muted" style="font-size:.82rem">Spot owner · Paid via Venmo</div></div>
          ${isOwner ? '' : `<button class="btn btn-ghost btn-sm" id="msg">${icon('chat')} Message</button>`}
        </div>
      </div>

      <aside class="card card-pad book-box" id="book">
        ${isOwner ? `<h3>This is your spot</h3><p class="muted">Manage it and see bookings from your host dashboard.</p><a class="btn btn-primary btn-block" href="#/host">Go to dashboard</a>` : `
        <h3 style="margin-bottom:12px">Book this spot</h3>
        ${s.rent_options.length > 1 ? `<div class="seg" role="tablist" id="periods">${s.rent_options.map((p) => `<button type="button" role="tab" data-period="${p}">${PERIODS[p].unit === 'game' ? 'Game' : PERIODS[p].unit[0].toUpperCase() + PERIODS[p].unit.slice(1)}</button>`).join('')}</div>` : ''}
        <div class="form" id="book-form"></div>
        <div class="total-row"><span class="muted" id="total-label"></span><strong id="total"></strong></div>
        <p class="form-error" id="book-err" role="alert" hidden></p>
        <button class="btn btn-primary btn-block btn-lg" id="book-btn" style="margin-top:14px">Book Now</button>
        <p class="fine">${icon('info')} You'll pay the host directly with Venmo. The exact address is shared once they confirm your payment.</p>`}
      </aside>
    </div>
  </section>
  ${isOwner ? '' : `<div class="mobile-book-bar"><div><div class="price" id="bar-price"></div><div class="muted" style="font-size:.78rem" id="bar-sub"></div></div><button class="btn btn-primary" id="bar-btn">Book Now</button></div>`}`;

  view.querySelectorAll('[data-photo]').forEach((b) => b.addEventListener('click', () => {
    view.querySelector('#main-photo').src = photos[+b.dataset.photo];
    view.querySelectorAll('[data-photo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  view.querySelector('#msg')?.addEventListener('click', async () => {
    const u = await requireAuth('Sign in to message the host.');
    if (!u) return;
    try { const id = await store.openConversation(s.id); go(`/messages/${id}`); } catch (e) { toast(e.message, 'err'); }
  });
  if (isOwner) return;

  const formEl = view.querySelector('#book-form');
  const err = view.querySelector('#book-err');

  function dateOk() {
    if (!state.date) return 'This spot has no upcoming game dates.';
    if (state.date < todayISO()) return 'Pick a date from today on.';
    if (state.period === 'day') {
      const end = endDateFor('day', state.date, state.qty);
      for (let d = state.date; d < end; d = addDaysISO(d, 1)) {
        if (!s.avail_days.includes(parseISO(d).getDay())) return `Not available on ${fmtDay(d)}. This spot is open ${daysSummary(s.avail_days)}.`;
      }
    }
    return '';
  }

  function paint() {
    view.querySelectorAll('[data-period]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.period === state.period)));
    const P = PERIODS[state.period];
    if (state.period === 'event') {
      formEl.innerHTML = upcomingGames.length
        ? `<label class="field"><span>${esc(s.event_label || 'Event')} date</span><select id="f-date">${upcomingGames.map((d) => `<option value="${d}" ${d === state.date ? 'selected' : ''}>${fmtDay(d)}</option>`).join('')}</select></label>`
        : '<p class="muted">No upcoming game dates right now.</p>';
    } else {
      formEl.innerHTML = `
        <label class="field"><span>${state.period === 'day' ? 'Date' : 'Start date'}</span><input id="f-date" type="date" min="${todayISO()}" value="${state.date}" /></label>
        <div class="field"><span>How many ${P.plural}?</span>
          <div class="stepper"><button type="button" id="q-minus" aria-label="Fewer">${icon('minus')}</button><output id="q">${state.qty}</output><button type="button" id="q-plus" aria-label="More">${icon('plus')}</button></div>
        </div>`;
      view.querySelector('#q-minus').disabled = state.qty <= 1;
      view.querySelector('#q-plus').disabled = state.qty >= MAX_QTY[state.period];
      view.querySelector('#q-minus').onclick = () => { state.qty--; paint(); };
      view.querySelector('#q-plus').onclick = () => { state.qty++; paint(); };
    }
    const d = view.querySelector('#f-date');
    if (d) d.onchange = () => { state.date = d.value; paint(); };

    const qty = state.period === 'event' ? 1 : state.qty;
    const cents = priceCents(s, state.period) * qty;
    const last = state.date ? addDaysISO(endDateFor(state.period, state.date, qty), -1) : '';
    view.querySelector('#total-label').textContent = state.date
      ? (state.period === 'day' && qty === 1) || state.period === 'event' ? `${fmtDay(state.date)} · ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}` : `${fmtDate(state.date, { month: 'short', day: 'numeric' })} – ${fmtDate(last, { month: 'short', day: 'numeric' })}`
      : '';
    view.querySelector('#total').textContent = money(cents, { decimals: 2 });
    view.querySelector('#bar-price').innerHTML = `${money(priceCents(s, state.period))}<small>${P.short}</small>`;
    view.querySelector('#bar-sub').textContent = `Total ${money(cents, { decimals: 2 })}`;
    const problem = dateOk();
    err.textContent = problem; err.hidden = !problem;
    view.querySelector('#book-btn').disabled = !!problem;
  }

  view.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => {
    state.period = b.dataset.period; state.qty = 1;
    if (state.period === 'event') state.date = upcomingGames[0] || '';
    else if (!state.date || state.date < todayISO()) state.date = todayISO();
    if (state.period === 'day') state.date = nextOpenDay(state.date);
    paint();
  }));
  paint();

  view.querySelector('#bar-btn').addEventListener('click', () => {
    view.querySelector('#book').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  view.querySelector('#book-btn').addEventListener('click', async () => {
    const btn = view.querySelector('#book-btn');
    const u = await requireAuth('Sign in to book this spot.');
    if (!u) return;
    if (u.id === s.owner_id) { toast('You can\'t book your own spot.', 'err'); return; }
    btn.disabled = true;
    try {
      const b = await store.createBooking({ spot_id: s.id, period: state.period, start_date: state.date, quantity: state.period === 'event' ? 1 : state.qty });
      go(`/pay/${b.id}`);
    } catch (e) {
      err.textContent = e.message; err.hidden = false; btn.disabled = false;
    }
  });
}
