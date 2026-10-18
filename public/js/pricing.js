// Suggested price for a new listing: a base rate per rental period, adjusted
// for distance to campus and the type of spot, then nudged toward what similar
// nearby spots already charge.

const BASE = { day: 1000, week: 4000, month: 14000, event: 2500 };
const TYPE = { garage: 1.25, lot: 0.95, driveway: 1, other: 0.9 };

function distanceFactor(mi) {
  if (mi == null || Number.isNaN(mi)) return 1;
  if (mi <= 0.5) return 1.2;
  if (mi <= 1) return 1;
  if (mi <= 2) return 0.85;
  return 0.7;
}

const roundTo = (cents, step) => Math.max(step, Math.round(cents / step) * step);

export function comparablePrices(spots, { city, period, excludeOwner }) {
  return spots
    .filter((s) => s.city.toLowerCase() === (city || '').toLowerCase() && s.rent_options.includes(period) && s.owner_id !== excludeOwner)
    .map((s) => s[`price_${period}_cents`])
    .sort((a, b) => a - b);
}

export function suggestPrice({ period, distance_mi, spot_type, covered, comparables = [] }) {
  let cents = BASE[period] * distanceFactor(distance_mi) * (TYPE[spot_type] ?? 1) * (covered && spot_type !== 'garage' ? 1.1 : 1);
  if (comparables.length >= 3) {
    const median = comparables[Math.floor(comparables.length / 2)];
    cents = cents * 0.6 + median * 0.4;
  }
  const step = period === 'day' ? 100 : 500;
  const suggested = roundTo(cents, step);
  return {
    suggested,
    min: roundTo(suggested * 0.4, step),
    max: roundTo(suggested * 2.5, step),
    step,
    range: comparables.length ? [comparables[0], comparables[comparables.length - 1]] : null,
  };
}

export function priceVerdict(price, suggested) {
  const r = price / suggested;
  if (r < 0.85) return { text: 'Below suggested: books fastest', tone: 'ok' };
  if (r <= 1.15) return { text: 'Right around the suggested price', tone: 'ok' };
  if (r <= 1.5) return { text: 'Above suggested: may book less often', tone: 'warn' };
  return { text: 'Well above suggested: few commuters will book', tone: 'warn' };
}
