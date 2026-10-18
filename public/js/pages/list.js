import { esc, icon, money, PERIODS, SPOT_TYPES, DAY_NAMES, daysSummary, fmtTime, fmtDate, todayISO, toast } from '../ui.js';
import { BOULDER_AREAS } from '../samples.js';
import { suggestPrice, comparablePrices, priceVerdict } from '../pricing.js';

const STEPS = ['Spot Details', 'Pricing & Availability', 'Payment Info', 'Review'];
const fresh = () => ({
  step: 0, title: '', address: '', city: 'Boulder', area: '', distance: '', spot_type: 'driveway', covered: false,
  spot_count: 1, options: ['day'], prices: {}, touched: {}, days: [1, 2, 3, 4, 5], start: '07:00', end: '18:00',
  event_label: 'CU home game', event_dates: [], description: '', files: [], previews: [], venmo: '',
});
let S = fresh();

export default async function list(view, ctx) {
  const { store, requireAuth, go } = ctx;
  const user = await store.getUser();
  if (user && !S.venmo) S.venmo = user.venmo_username || '';
  const maxPhotos = store.mode === 'demo' ? 3 : 5;
  const allSpots = await store.listSpots();

  const priceInfo = (period) => suggestPrice({
    period, distance_mi: S.distance === '' ? null : Number(S.distance), spot_type: S.spot_type, covered: S.covered,
    comparables: comparablePrices(allSpots, { city: S.city, period, excludeOwner: user?.id }),
  });
  const ensurePrices = () => S.options.forEach((p) => { if (!S.touched[p]) S.prices[p] = priceInfo(p).suggested; });

  function shell(inner) {
    view.innerHTML = `
    <section class="page narrow wizard">
      <div class="page-head"><h1>List Your Spot</h1><p>Turn your unused space into extra income.</p></div>
      <ol class="progress" aria-label="Steps">
        <span class="bar" style="width:${(S.step / 3) * 75}%"></span>
        ${STEPS.map((t, i) => `<li class="${i < S.step ? 'done' : i === S.step ? 'now' : ''}" ${i === S.step ? 'aria-current="step"' : ''}><div class="dot">${i < S.step ? icon('check') : i + 1}</div>${t}</li>`).join('')}
      </ol>
      <div class="card card-pad">${inner}
        <p class="form-error" id="err" role="alert" hidden></p>
        <div class="wizard-nav">
          ${S.step > 0 ? '<button class="btn btn-ghost" id="prev">Back</button>' : '<span></span>'}
          <button class="btn btn-primary" id="next">${S.step === 3 ? 'Publish spot' : 'Next'}</button>
        </div>
      </div>
    </section>`;
    view.querySelector('#prev')?.addEventListener('click', () => { S.step--; draw(); window.scrollTo(0, 0); });
    view.querySelector('#next').addEventListener('click', next);
  }
  const showErr = (m) => { const e = view.querySelector('#err'); e.textContent = m; e.hidden = !m; if (m) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

  // ------------------------------------------------------------ step 1
  function step1() {
    shell(`
      <h2>1. Spot Details</h2><p class="lead">Tell us about your parking space.</p>
      <div class="form">
        <label class="field"><span>Address</span><input id="address" value="${esc(S.address)}" placeholder="1234 Example St, Boulder, CO" autocomplete="street-address" />
          <small>Only shown to renters after you confirm their payment.</small></label>
        <div class="grid-2">
          <label class="field"><span>City</span><input id="city" value="${esc(S.city)}" autocomplete="address-level2" /></label>
          <label class="field"><span>Neighborhood</span><input id="area" list="areas" value="${esc(S.area)}" placeholder="University Hill" />
            <datalist id="areas">${Object.keys(BOULDER_AREAS).map((a) => `<option value="${esc(a)}"></option>`).join('')}</datalist></label>
        </div>
        <div class="grid-2">
          <label class="field"><span>Listing name</span><input id="title" value="${esc(S.title)}" maxlength="80" placeholder="North Campus Driveway" /></label>
          <label class="field"><span>Distance to campus (mi)</span><input id="distance" type="number" inputmode="decimal" min="0" max="30" step="0.1" value="${esc(S.distance)}" placeholder="0.5" /></label>
        </div>
        <div class="field"><span>Spot Type</span>
          <div class="type-grid">${Object.entries(SPOT_TYPES).map(([k, t]) => `<button type="button" class="type-opt" data-type="${k}" aria-pressed="${S.spot_type === k}">${icon(t.icon)}${t.label}</button>`).join('')}</div>
        </div>
        <label class="switch"><input type="checkbox" id="covered" ${S.covered ? 'checked' : ''} /> Covered from snow and rain</label>
        <div class="field"><span>Number of Spots Available</span>
          <div class="stepper"><button type="button" id="c-minus" aria-label="Fewer" ${S.spot_count <= 1 ? 'disabled' : ''}>${icon('minus')}</button><output>${S.spot_count}</output><button type="button" id="c-plus" aria-label="More" ${S.spot_count >= 20 ? 'disabled' : ''}>${icon('plus')}</button></div>
        </div>
        <div class="field"><span>How often do you want to rent your spot?</span>
          <div class="chips">${Object.entries(PERIODS).map(([k, p]) => `<button type="button" class="chip" data-opt="${k}" aria-pressed="${S.options.includes(k)}">${p.label}</button>`).join('')}</div>
          <small>Pick as many as you like.</small>
        </div>
        <div class="field"><span>Add Photos</span>
          <label class="dropzone" id="drop">${icon('upload')}<strong>Upload up to ${maxPhotos} photos</strong><span>Drag and drop or click to upload</span>
            <input type="file" id="files" accept="image/jpeg,image/png,image/webp" multiple hidden /></label>
          <div class="thumbs" id="thumbs">${S.previews.map((p, i) => `<div class="thumb"><img src="${p}" alt="" /><button type="button" data-rm="${i}" aria-label="Remove photo">${icon('close')}</button></div>`).join('')}</div>
        </div>
        <label class="field"><span>Description (optional)</span><textarea id="description" maxlength="1000" placeholder="Where to pull in, gate codes after booking, anything commuters should know.">${esc(S.description)}</textarea></label>
      </div>`);

    const bind = (id, key, fn) => view.querySelector(`#${id}`).addEventListener('input', (e) => { S[key] = e.target.value; fn?.(); });
    bind('address', 'address'); bind('city', 'city'); bind('title', 'title'); bind('distance', 'distance'); bind('description', 'description');
    bind('area', 'area', () => {
      if (BOULDER_AREAS[S.area] != null) { S.distance = String(BOULDER_AREAS[S.area]); view.querySelector('#distance').value = S.distance; }
      const t = view.querySelector('#title');
      if (!S.title || S.autoTitle) { S.title = S.area ? `${S.area} ${SPOT_TYPES[S.spot_type].label}` : ''; S.autoTitle = true; t.value = S.title; }
    });
    view.querySelector('#title').addEventListener('input', () => { S.autoTitle = false; });
    view.querySelector('#covered').onchange = (e) => { S.covered = e.target.checked; };
    view.querySelectorAll('[data-type]').forEach((b) => { b.onclick = () => {
      S.spot_type = b.dataset.type;
      if (S.autoTitle && S.area) S.title = `${S.area} ${SPOT_TYPES[S.spot_type].label}`;
      if (S.spot_type === 'garage') S.covered = true;
      draw();
    }; });
    view.querySelector('#c-minus').onclick = () => { S.spot_count--; draw(); };
    view.querySelector('#c-plus').onclick = () => { S.spot_count++; draw(); };
    view.querySelectorAll('[data-opt]').forEach((b) => { b.onclick = () => {
      const k = b.dataset.opt;
      S.options = S.options.includes(k) ? S.options.filter((x) => x !== k) : [...S.options, k].sort((a, c) => Object.keys(PERIODS).indexOf(a) - Object.keys(PERIODS).indexOf(c));
      b.setAttribute('aria-pressed', String(S.options.includes(k)));
    }; });
    const input = view.querySelector('#files');
    const drop = view.querySelector('#drop');
    const add = (files) => {
      const imgs = [...files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
      if (imgs.length < files.length) toast('Only JPG, PNG or WebP photos, please.', 'err');
      for (const f of imgs) {
        if (S.files.length >= maxPhotos) { toast(`Up to ${maxPhotos} photos.`, 'err'); break; }
        if (f.size > 15 * 1024 * 1024) { toast(`${f.name} is too large.`, 'err'); continue; }
        S.files.push(f); S.previews.push(URL.createObjectURL(f));
      }
      draw();
    };
    input.onchange = () => add(input.files);
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', (e) => add(e.dataTransfer.files));
    view.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { const i = +b.dataset.rm; URL.revokeObjectURL(S.previews[i]); S.files.splice(i, 1); S.previews.splice(i, 1); draw(); }; });
  }
  function check1() {
    if (S.address.trim().length < 5) return 'Enter the street address of the spot.';
    if (S.city.trim().length < 2) return 'Enter the city.';
    if (S.title.trim().length < 3) return 'Give your listing a short name, like "University Hill Driveway".';
    if (S.distance !== '' && !(Number(S.distance) >= 0 && Number(S.distance) <= 30)) return 'Distance should be between 0 and 30 miles.';
    if (!S.options.length) return 'Choose at least one way to rent your spot.';
    return '';
  }

  // ------------------------------------------------------------ step 2
  function step2() {
    ensurePrices();
    const blocks = S.options.map((p) => {
      const info = priceInfo(p);
      const v = S.prices[p];
      const pct = (x) => Math.max(0, Math.min(100, ((x - info.min) / (info.max - info.min)) * 100));
      const verdict = priceVerdict(v, info.suggested);
      return `<div class="price-block" data-block="${p}">
        <div class="price-head"><h3>${PERIODS[p].label}</h3>
          <div class="prefix price-input"><b>$</b><input type="number" inputmode="decimal" min="1" max="1000" step="1" value="${(v / 100).toFixed(0)}" data-price="${p}" aria-label="${PERIODS[p].label} price in dollars" /></div></div>
        <div class="slider-wrap">
          <span class="suggest-mark" style="left:${pct(info.suggested)}%">Suggested ${money(info.suggested)}</span>
          <input type="range" min="${info.min}" max="${info.max}" step="${info.step}" value="${Math.min(info.max, Math.max(info.min, v))}" data-slider="${p}" style="--fill:${pct(v)}%" aria-label="${PERIODS[p].label} price" />
        </div>
        <div class="slider-scale"><span>${money(info.min)}</span><span>${money(info.max)}</span></div>
        <div class="verdict ${verdict.tone}" data-verdict="${p}">${verdict.text}</div>
        ${info.range ? `<div class="hint" style="margin-top:4px">Similar spots in ${esc(S.city)}: ${money(info.range[0])}–${money(info.range[1])}${PERIODS[p].short}</div>` : ''}
      </div>`;
    }).join('');

    shell(`
      <h2>2. Pricing &amp; Availability</h2><p class="lead">Slide to set your price. We suggest one based on distance to campus, spot type and similar spots nearby.</p>
      ${blocks}
      <div class="form" style="margin-top:22px">
        <div class="field"><span>Days available</span>
          <div class="days">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="chip chip-sm" data-day="${d}" aria-pressed="${S.days.includes(d)}">${DAY_NAMES[d]}</button>`).join('')}</div>
        </div>
        <div class="grid-2">
          <label class="field"><span>From</span><input type="time" id="start" value="${S.start}" /></label>
          <label class="field"><span>Until</span><input type="time" id="end" value="${S.end}" /></label>
        </div>
        ${S.options.includes('event') ? `
        <div class="field"><span>Event name</span><input id="event_label" value="${esc(S.event_label)}" maxlength="80" placeholder="CU home game" /></div>
        <div class="field"><span>Event dates</span>
          <div class="row"><input type="date" id="ev-date" min="${todayISO()}" style="max-width:200px" /><button type="button" class="btn btn-ghost btn-sm" id="ev-add">${icon('plus')} Add date</button></div>
          <div class="date-list">${S.event_dates.map((d) => `<button type="button" class="chip chip-sm" data-evrm="${d}" aria-label="Remove ${d}">${fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })} ${icon('close')}</button>`).join('') || '<small>Add each game or event day you\'ll offer.</small>'}</div>
        </div>` : ''}
      </div>`);

    const setPrice = (p, cents, from) => {
      const info = priceInfo(p);
      S.prices[p] = cents; S.touched[p] = true;
      const blk = view.querySelector(`[data-block="${p}"]`);
      const slider = blk.querySelector('[data-slider]');
      const field = blk.querySelector('[data-price]');
      if (from !== 'slider') slider.value = Math.min(info.max, Math.max(info.min, cents));
      if (from !== 'input') field.value = (cents / 100).toFixed(0);
      slider.style.setProperty('--fill', `${Math.max(0, Math.min(100, ((cents - info.min) / (info.max - info.min)) * 100))}%`);
      const v = priceVerdict(cents, info.suggested);
      const el = blk.querySelector('[data-verdict]'); el.textContent = v.text; el.className = `verdict ${v.tone}`;
    };
    view.querySelectorAll('[data-slider]').forEach((s) => s.addEventListener('input', () => setPrice(s.dataset.slider, Number(s.value), 'slider')));
    view.querySelectorAll('[data-price]').forEach((f) => f.addEventListener('input', () => { const d = Number(f.value); if (d >= 1) setPrice(f.dataset.price, Math.round(d * 100), 'input'); }));
    view.querySelectorAll('[data-day]').forEach((b) => { b.onclick = () => { const d = +b.dataset.day; S.days = S.days.includes(d) ? S.days.filter((x) => x !== d) : [...S.days, d]; b.setAttribute('aria-pressed', String(S.days.includes(d))); }; });
    view.querySelector('#start').onchange = (e) => { S.start = e.target.value; };
    view.querySelector('#end').onchange = (e) => { S.end = e.target.value; };
    view.querySelector('#event_label')?.addEventListener('input', (e) => { S.event_label = e.target.value; });
    view.querySelector('#ev-add')?.addEventListener('click', () => {
      const d = view.querySelector('#ev-date').value;
      if (!d || d < todayISO()) { toast('Pick a future date.', 'err'); return; }
      if (!S.event_dates.includes(d)) S.event_dates = [...S.event_dates, d].sort();
      draw();
    });
    view.querySelectorAll('[data-evrm]').forEach((b) => { b.onclick = () => { S.event_dates = S.event_dates.filter((x) => x !== b.dataset.evrm); draw(); }; });
  }
  function check2() {
    for (const p of S.options) if (!(S.prices[p] >= 100 && S.prices[p] <= 100000)) return `Set a ${PERIODS[p].unit} price between $1 and $1,000.`;
    if (!S.days.length) return 'Pick at least one day the spot is available.';
    if (!S.start || !S.end || S.end <= S.start) return 'The end time needs to be after the start time.';
    if (S.options.includes('event') && !S.event_dates.length) return 'Add at least one event date.';
    return '';
  }

  // ------------------------------------------------------------ step 3
  async function step3() {
    const u = await store.getUser();
    shell(`
      <h2>3. Payment Info</h2><p class="lead">Commuters pay you directly on Venmo. Spotted never holds your money.</p>
      ${u ? `<div class="notice" style="margin-bottom:16px">${icon('user')}<div><strong>Listing as ${esc(u.full_name)}</strong><p>${esc(u.email)}</p></div></div>`
        : `<div class="notice" style="margin-bottom:16px">${icon('user')}<div><strong>Sign in to publish</strong><p>Create a free account so you can manage bookings and chat with commuters.</p><button type="button" class="btn btn-primary btn-sm" id="si" style="margin-top:8px">Sign in or create account</button></div></div>`}
      <div class="form">
        <label class="field"><span>Your Venmo username</span>
          <div class="prefix"><b>@</b><input id="venmo" value="${esc(S.venmo)}" placeholder="Alex-Rivera" autocomplete="off" /></div>
          <small>Renters see a QR code for this account with the exact amount and a booking code in the note.</small></label>
        <ol class="pay-steps" style="margin-top:6px">
          <li><span>A commuter books and pays your Venmo.</span></li>
          <li><span>You check Venmo for the amount and booking code, then tap <b>Payment received</b> on your dashboard.</span></li>
          <li><span>They get your address and park. Chat any time from Messages.</span></li>
        </ol>
      </div>`);
    view.querySelector('#venmo').addEventListener('input', (e) => { S.venmo = e.target.value.replace(/^@/, '').trim(); });
    view.querySelector('#si')?.addEventListener('click', async () => {
      const nu = await requireAuth('Sign in to publish your spot.');
      if (nu) { if (!S.venmo) S.venmo = nu.venmo_username || ''; draw(); }
    });
  }
  async function check3() {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{4,29}$/.test(S.venmo)) return 'Enter your Venmo username (5–30 letters, numbers, - or _).';
    if (!await store.getUser()) return 'Sign in or create an account to continue.';
    return '';
  }

  // ------------------------------------------------------------ step 4
  function step4() {
    const row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
    shell(`
      <h2>4. Review</h2><p class="lead">Make sure everything looks right. You can pause or remove the spot any time.</p>
      ${S.previews[0] ? `<img src="${S.previews[0]}" alt="" style="width:100%;max-height:240px;object-fit:cover;border-radius:12px;margin-bottom:12px" />` : ''}
      <div class="review-list">
        ${row('Listing', esc(S.title))}
        ${row('Address', esc(S.address))}
        ${row('Neighborhood', esc([S.area, S.city].filter(Boolean).join(', ')))}
        ${S.distance !== '' ? row('Distance', `${esc(S.distance)} mi from CU`) : ''}
        ${row('Type', `${SPOT_TYPES[S.spot_type].label}${S.covered ? ', covered' : ''} · ${S.spot_count} space${S.spot_count > 1 ? 's' : ''}`)}
        ${row('Pricing', S.options.map((p) => `${money(S.prices[p])}${PERIODS[p].short}`).join(' · '))}
        ${row('Available', `${esc(daysSummary(S.days))}, ${fmtTime(S.start)}–${fmtTime(S.end)}`)}
        ${S.options.includes('event') ? row(esc(S.event_label || 'Events'), S.event_dates.map((d) => fmtDate(d, { month: 'short', day: 'numeric' })).join(', ')) : ''}
        ${row('Photos', S.files.length ? `${S.files.length}` : 'None (we\'ll use an illustration)')}
        ${row('Paid to', `@${esc(S.venmo)} on Venmo`)}
      </div>`);
  }

  async function next() {
    const btn = view.querySelector('#next');
    const problem = S.step === 0 ? check1() : S.step === 1 ? check2() : S.step === 2 ? await check3() : '';
    if (problem) { showErr(problem); return; }
    if (S.step < 3) { S.step++; draw(); window.scrollTo(0, 0); return; }
    btn.disabled = true; btn.textContent = 'Publishing…';
    try {
      const u = await requireAuth('Sign in to publish your spot.');
      if (!u) { btn.disabled = false; btn.textContent = 'Publish spot'; return; }
      if (u.venmo_username !== S.venmo) await store.updateProfile({ venmo_username: S.venmo });
      const has = (p) => S.options.includes(p);
      await store.createSpot({
        title: S.title.trim(), description: S.description.trim(), city: S.city.trim(), area: S.area.trim(),
        distance_mi: S.distance === '' ? null : Math.round(Number(S.distance) * 10) / 10,
        spot_type: S.spot_type, covered: S.covered, spot_count: S.spot_count, rent_options: S.options,
        price_day_cents: has('day') ? S.prices.day : null, price_week_cents: has('week') ? S.prices.week : null,
        price_month_cents: has('month') ? S.prices.month : null, price_event_cents: has('event') ? S.prices.event : null,
        avail_days: [...S.days].sort(), start_time: S.start, end_time: S.end,
        event_label: has('event') ? S.event_label.trim() : '', event_dates: has('event') ? S.event_dates : [],
      }, S.address.trim(), S.files);
      S.previews.forEach((p) => URL.revokeObjectURL(p));
      S = fresh();
      toast('Your spot is live!');
      go('/host');
    } catch (e) {
      showErr(e.message); btn.disabled = false; btn.textContent = 'Publish spot';
    }
  }

  function draw() { [step1, step2, step3, step4][S.step](); }
  draw();
}
