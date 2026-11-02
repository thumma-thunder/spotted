// Spotted's parking zones, traced by hand from the team's "Parking Zones & Pricing" slide.
// Each zone is an ellipse: center [lat, lng], half-length and half-width in meters, and the
// angle of its long side (degrees counterclockwise from east). Tier 1 wins where zones overlap.

export const TIERS = {
  1: { label: 'Tier 1', color: '#1A56E8', weekly: 'about $25/week' },
  2: { label: 'Tier 2', color: '#F28C3C', weekly: '$15–20/week' },
};

export const ZONES = [
  { name: 'University Hill (13th–16th St)', tier: 1, center: [40.0048, -105.2750], a: 920, b: 200, rot: 124 },
  { name: 'Scott Carpenter Park / Baseline Sub', tier: 1, center: [40.0071, -105.2566], a: 720, b: 210, rot: 90 },
  { name: 'Interurban Park', tier: 1, center: [39.9967, -105.2668], a: 340, b: 145, rot: 5 },
  { name: 'Goss-Grove', tier: 2, center: [40.0153, -105.2699], a: 480, b: 190, rot: 3 },
  { name: 'West Hill / Lower Chautauqua', tier: 2, center: [40.0031, -105.2794], a: 1020, b: 320, rot: 117 },
  { name: 'Aurora Ave', tier: 2, center: [40.0028, -105.2497], a: 380, b: 380, rot: 0 },
];

const M_PER_LAT = 111_000;
const mPerLng = (lat) => 111_320 * Math.cos(lat * Math.PI / 180);

// Meters east/north of the zone center, turned into the zone's own axes.
function local(z, lat, lng) {
  const x = (lng - z.center[1]) * mPerLng(z.center[0]);
  const y = (lat - z.center[0]) * M_PER_LAT;
  const t = z.rot * Math.PI / 180;
  return [x * Math.cos(t) + y * Math.sin(t), -x * Math.sin(t) + y * Math.cos(t)];
}

export function zoneAt(pt) {
  if (!pt) return null;
  const hits = ZONES.filter((z) => {
    const [u, v] = local(z, pt.lat, pt.lng);
    return (u / z.a) ** 2 + (v / z.b) ** 2 <= 1;
  });
  return hits.sort((p, q) => p.tier - q.tier)[0] || null;
}

// Outline of a zone as [lat, lng] points, for drawing on the map.
export function zoneOutline(z, n = 48) {
  const t = z.rot * Math.PI / 180;
  return Array.from({ length: n }, (_, i) => {
    const s = (2 * Math.PI * i) / n;
    const u = z.a * Math.cos(s), v = z.b * Math.sin(s);
    const x = u * Math.cos(t) - v * Math.sin(t), y = u * Math.sin(t) + v * Math.cos(t);
    return [z.center[0] + y / M_PER_LAT, z.center[1] + x / mPerLng(z.center[0])];
  });
}
