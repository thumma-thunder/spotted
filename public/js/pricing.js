// Suggested price for a new listing: a base rate for the spot's parking zone
// (see zones.js), adjusted for the type of spot. Owners still set the final
// price; similar spots' prices are shown next to it for comparison.

// Weekly rates come from the team's zone slide (Tier 1 $25, Tier 2 $15-20).
// Day, month and game-day rates keep the same proportions to the week.
const BASE = {
  1: { day: 600, week: 2500, month: 9000, event: 2500 },
  2: { day: 500, week: 1800, month: 6500, event: 2000 },
  none: { day: 400, week: 1500, month: 5500, event: 1500 },
};
const TYPE = { garage: 1.25, lot: 0.95, driveway: 1, other: 0.9 };

const roundTo = (cents, step) => Math.max(step, Math.round(cents / step) * step);

export function comparablePrices(spots, { city, period, excludeOwner }) {
  return spots
    .filter((s) => s.city.toLowerCase() === (city || '').toLowerCase() && s.rent_options.includes(period) && s.owner_id !== excludeOwner)
    .map((s) => s[`price_${period}_cents`])
    .sort((a, b) => a - b);
}

export function suggestPrice({ period, zone, spot_type, covered, comparables = [] }) {
  const cents = BASE[zone?.tier ?? 'none'][period] * (TYPE[spot_type] ?? 1) * (covered && spot_type !== 'garage' ? 1.1 : 1);
  const step = period === 'month' ? 500 : 100;
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
