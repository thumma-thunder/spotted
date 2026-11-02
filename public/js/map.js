// Map of search results. Leaflet (vendored, BSD-2) with free OpenStreetMap tiles: no API key.
import { esc, money, PERIODS } from './ui.js';
import { ZONES, TIERS, zoneOutline } from './zones.js';

const CAMPUS = [40.0076, -105.2659];
let loading;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  loading ||= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'js/vendor/leaflet/leaflet.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = 'js/vendor/leaflet/leaflet.js';
    js.onload = () => resolve(window.L);
    js.onerror = () => { loading = null; reject(new Error('Map failed to load')); };
    document.head.append(js);
  });
  return loading;
}

// Pins sit about a block from the spot (3 decimals ~ 100 m). The street address stays private until a booking is confirmed.
const approx = (pt) => [Math.round(pt.lat * 1000) / 1000, Math.round(pt.lng * 1000) / 1000];

// Spots that share a point (e.g. only their neighborhood is known) get fanned out so each pin can be tapped.
function spread(points) {
  const groups = new Map();
  points.forEach((p, i) => {
    const k = p.join(',');
    groups.set(k, [...(groups.get(k) || []), i]);
  });
  const out = points.map((p) => [...p]);
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    idx.forEach((i, n) => {
      const a = (2 * Math.PI * n) / idx.length;
      out[i] = [out[i][0] + 0.0012 * Math.sin(a), out[i][1] + 0.0016 * Math.cos(a)];
    });
  }
  return out;
}

// results: [{ s, pt, cents, period, full, href, photo }]. Returns { highlight(id) } or null if the map could not load.
export async function mountSpotMap(el, { results, near }) {
  let L;
  try { L = await loadLeaflet(); } catch {
    el.innerHTML = '<p class="muted map-fallback">The map could not load. The list below still works.</p>';
    return null;
  }
  if (!el.isConnected) return null;
  el.innerHTML = '';
  const map = L.map(el, { scrollWheelZoom: false, zoomControl: true }).setView(CAMPUS, 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);
  // Let people scroll the page past the map; zoom with the wheel once they click into it.
  map.on('focus click', () => map.scrollWheelZoom.enable());
  map.on('blur mouseout', () => map.scrollWheelZoom.disable());

  // Shaded parking zones, matching the team's pricing tiers.
  ZONES.forEach((z) => {
    const c = TIERS[z.tier].color;
    L.polygon(zoneOutline(z), { color: c, weight: 1, fillColor: c, fillOpacity: 0.18, interactive: true })
      .bindTooltip(`${esc(z.name)} · ${TIERS[z.tier].label}`, { sticky: true })
      .addTo(map);
  });
  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const d = L.DomUtil.create('div', 'map-legend');
    d.innerHTML = Object.values(TIERS).map((t) => `<span><i style="background:${t.color}"></i>${t.label} zone</span>`).join('');
    return d;
  };
  legend.addTo(map);

  const campusIcon = L.divIcon({ className: 'map-place', html: '<span>CU</span>', iconSize: [34, 34] });
  L.marker(CAMPUS, { icon: campusIcon, keyboard: false, title: 'CU Boulder campus' }).addTo(map);
  const bounds = [CAMPUS];
  if (near) {
    const b = [near.lat, near.lng];
    L.marker(b, { icon: L.divIcon({ className: 'map-place near', html: '<span>★</span>', iconSize: [30, 30] }), title: near.name })
      .bindTooltip(esc(near.name.split(/[:(]/)[0].trim()), { direction: 'top', offset: [0, -14] }).addTo(map);
    bounds.push(b);
  }

  const placed = results.filter((r) => r.pt);
  const points = spread(placed.map((r) => approx(r.pt)));
  const pins = new Map();
  placed.forEach((r, i) => {
    const icon = L.divIcon({
      className: `map-pin${r.full ? ' full' : ''}`,
      html: `<span>${money(r.cents)}</span>`,
      iconSize: null,
      iconAnchor: [0, 0],
      popupAnchor: [0, -30],
    });
    const m = L.marker(points[i], { icon, title: r.s.title, riseOnHover: true }).addTo(map);
    m.bindPopup(`
      <a class="map-pop" href="${r.href}">
        <img src="${esc(r.photo)}" alt="" />
        <strong>${esc(r.s.title)}</strong>
        <span class="price">${money(r.cents)}<small>${PERIODS[r.period].short}</small></span>
        <span class="muted">${r.full ? 'Booked for this date' : 'Approximate location · tap to book'}</span>
      </a>`, { closeButton: false, minWidth: 180, maxWidth: 220 });
    pins.set(r.s.id, m);
    bounds.push(points[i]);
  });
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  // The container can change size after layout settles (fonts, images); keep tiles filling it.
  requestAnimationFrame(() => map.invalidateSize());

  return {
    highlight(id, on) {
      const el = pins.get(id)?.getElement();
      if (!el) return;
      el.classList.toggle('active', on);
      pins.get(id).setZIndexOffset(on ? 1000 : 0);
    },
    refresh: () => map.invalidateSize(),
  };
}
