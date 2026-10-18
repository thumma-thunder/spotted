import { AREA_CENTERS } from './samples.js';

const NORLIN = { lat: 40.0087, lng: -105.2707 };

// Where a spot is on the map: its own coordinates, else its neighborhood's center.
export function spotPoint(s) {
  if (s.lat != null && s.lng != null) return { lat: Number(s.lat), lng: Number(s.lng) };
  const c = AREA_CENTERS[s.area];
  return c ? { lat: c[0], lng: c[1] } : null;
}

export function milesToCampus(pt) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (pt.lat - NORLIN.lat) * rad, dLng = (pt.lng - NORLIN.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(pt.lat * rad) * Math.cos(NORLIN.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Looks up an address with OpenStreetMap's free geocoder. Returns null if not found.
export async function geocode(address, city) {
  const q = /,/.test(address) ? address : `${address}, ${city}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok) return null;
    const [hit] = await res.json();
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  }
}
