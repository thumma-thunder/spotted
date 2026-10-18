import { esc, icon, money, PERIODS, SPOT_TYPES, headlinePrice, todayISO, parseISO, endDateFor, photoOf, rating, fmtDate } from '../ui.js';

const DEFAULTS = { city: 'Boulder, CO', area: '', date: todayISO(), from: '08:00', to: '17:00', period: 'any', sort: 'price_asc', avail: '' };

export default async function find(view, { store, query, go }) {
  const q = { ...DEFAULTS, ...query };
  if (q.date < todayISO()) q.date = todayISO();

  view.innerHTML = `
  <section class="find-hero">
    <div class="find-hero-inner">
      <h1>Find Your Spot</h1>
      <p>Search for parking near campus and compare options.</p>
      <form class="search-card" id="search" role="search">
        <div class="search-grid">
          <label class="field"><span>City</span>
            <div class="input-icon">${icon('pin')}<input name="city" list="cities" value="${esc(q.city)}" required autocomplete="address-level2" /></div>
            <datalist id="cities"><option value="Boulder, CO"></option></datalist>
          </label>
          <label class="field"><span>Area (optional)</span>
            <input name="area" value="${esc(q.area)}" placeholder="e.g., University Hill, Goss-Grove" />
          </label>
          <label class="field"><span>Date</span>
            <div class="input-icon">${icon('calendar')}<input name="date" type="date" min="${todayISO()}" value="${esc(q.date)}" required /></div>
          </label>
          <div class="field"><span class="label" style="font-size:.74rem;color:var(--muted);font-weight:600">Time</span>
            <div class="grid-2" style="gap:6px"><input name="from" type="time" value="${esc(q.from)}" aria-label="From" /><input name="to" type="time" value="${esc(q.to)}" aria-label="Until" /></div>
          </div>
          <label class="field"><span>How long</span>
            <select name="period">
              <option value="any">Any length</option>
              ${Object.entries(PERIODS).map(([k, p]) => `<option value="${k}" ${q.period === k ? 'selected' : ''}>${p.search}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="search-foot">
          <label class="switch"><input type="checkbox" name="avail" ${q.avail ? 'checked' : ''} /> Show only available</label>
          <button class="btn btn-primary btn-rect" type="submit" style="min-width:160px">${icon('search')} Search</button>
        </div>
      </form>
    </div>
  </section>
  <section class="page find-results">
    <div class="results-head">
      <h2 id="count">Available Spots</h2>
      <label class="row" style="gap:8px"><span class="muted" style="font-size:.84rem">Sort</span>
        <select id="sort" aria-label="Sort results">
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="distance">Closest to campus</option>
        </select>
      </label>
    </div>
    <div class="results" id="results"><p class="muted">Loading spots…</p></div>
  </section>`;

  const form = view.querySelector('#search');
  const sortSel = view.querySelector('#sort');
  sortSel.value = q.sort;

  const toQuery = () => {
    const fd = new FormData(form);
    const next = { city: fd.get('city').trim(), area: fd.get('area').trim(), date: fd.get('date'), from: fd.get('from'), to: fd.get('to'), period: fd.get('period'), sort: sortSel.value, avail: fd.get('avail') ? '1' : '' };
    return new URLSearchParams(Object.entries(next).filter(([k, v]) => v && v !== DEFAULTS[k])).toString();
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); go(`/find${toQuery() ? `?${toQuery()}` : ''}`); });
  sortSel.addEventListener('change', () => form.requestSubmit());
  form.avail.addEventListener('change', () => form.requestSubmit());
  form.period.addEventListener('change', () => form.requestSubmit());

  const [spots, booked] = await Promise.all([
    store.listSpots(),
    store.bookedBetween(q.date, endDateFor(q.period === 'any' || q.period === 'event' ? 'day' : q.period, q.date, 1)),
  ]);

  const cityKey = q.city.split(',')[0].trim().toLowerCase();
  const areaKey = q.area.toLowerCase();
  const dow = parseISO(q.date).getDay();
  const results = spots
    .filter((s) => s.status === 'active')
    .filter((s) => !cityKey || s.city.toLowerCase().includes(cityKey))
    .filter((s) => !areaKey || s.area.toLowerCase().includes(areaKey) || s.title.toLowerCase().includes(areaKey))
    .filter((s) => q.period === 'any' || s.rent_options.includes(q.period))
    .map((s) => {
      const nextGame = s.event_dates?.filter((d) => d >= q.date).sort()[0];
      const fitsDay = s.avail_days.includes(dow) && (!q.from || s.start_time.slice(0, 5) <= q.from) && (!q.to || s.end_time.slice(0, 5) >= q.to);
      const usable = q.period === 'event' ? !!nextGame
        : q.period === 'day' ? fitsDay
        : q.period === 'week' || q.period === 'month' ? true
        : fitsDay || s.rent_options.some((o) => o === 'week' || o === 'month') || !!nextGame;
      const taken = booked.filter((b) => b.spot_id === s.id).length;
      const full = taken >= s.spot_count;
      const { period, cents } = headlinePrice(s, q.period === 'any' ? null : q.period);
      return { s, usable, full, period, cents, nextGame };
    })
    .filter((r) => r.usable)
    .filter((r) => !q.avail || !r.full);

  const cmp = {
    price_asc: (a, b) => a.cents - b.cents,
    price_desc: (a, b) => b.cents - a.cents,
    distance: (a, b) => (a.s.distance_mi ?? 99) - (b.s.distance_mi ?? 99),
  }[q.sort] || ((a, b) => a.cents - b.cents);
  results.sort((a, b) => (a.full - b.full) || cmp(a, b));

  view.querySelector('#count').textContent = `Available Spots (${results.filter((r) => !r.full).length})`;
  const list = view.querySelector('#results');
  if (!results.length) {
    list.innerHTML = `<div class="card empty" style="grid-column:1/-1">${icon('search')}<h3>No spots match yet</h3>
      <p>Try a different date, a longer time window, or clear the area. Spotted is starting around CU Boulder.</p>
      <a class="btn btn-outline btn-sm" href="#/find">Reset search</a></div>`;
    return;
  }
  const link = (r) => {
    const p = new URLSearchParams({ period: r.period, date: r.period === 'event' && r.nextGame ? r.nextGame : q.date });
    return `#/spot/${encodeURIComponent(r.s.id)}?${p}`;
  };
  list.innerHTML = results.map((r) => `
    <a class="card spot-card ${r.full ? 'full' : ''}" href="${link(r)}">
      <img src="${esc(photoOf(r.s))}" alt="" loading="lazy" />
      <div class="body">
        <h3>${esc(r.s.title)}</h3>
        <div class="dist">${icon('pin')} ${r.s.distance_mi != null ? `${r.s.distance_mi} mi from CU` : esc(r.s.area || r.s.city)}</div>
        <div class="tags">
          <span class="tag">${icon(r.s.covered ? 'covered' : 'sun')} ${r.s.covered ? 'Covered' : 'Outdoor'}</span>
          <span class="tag">${icon(SPOT_TYPES[r.s.spot_type].icon)} ${SPOT_TYPES[r.s.spot_type].label}</span>
          ${r.period === 'event' && r.nextGame ? `<span class="tag">${icon('calendar')} ${fmtDate(r.nextGame, { month: 'short', day: 'numeric' })}</span>` : ''}
        </div>
      </div>
      <div class="price-col">
        <div style="text-align:right"><div class="price">${money(r.cents)}<small>${PERIODS[r.period].short}</small></div>${rating(r.s)}</div>
        ${r.full ? '<span class="pill pill-muted">Booked</span>' : '<span class="btn btn-primary btn-xs">Book</span>'}
      </div>
    </a>`).join('');
}
