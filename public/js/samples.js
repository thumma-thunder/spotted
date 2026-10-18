// Placeholder listings around CU Boulder. Used by demo mode, and turned into
// supabase/seed_sample_spots.sql by scripts/make-seed.mjs for the live database.
// eventDates: "saturdays" = the next three Saturdays two weeks apart.

export const SAMPLE_SPOTS = [
  {
    key: 'north-campus-driveway', lat: 40.0063, lng: -105.2775,
    title: 'North Campus Driveway',
    description: 'Wide driveway on a quiet street, a short walk to Norlin Quad. Pull all the way up to the garage door.',
    address: '1234 Example St, Boulder, CO',
    city: 'Boulder', area: 'University Hill', distance_mi: 0.4,
    spot_type: 'driveway', covered: false, spot_count: 1,
    rent_options: ['day', 'week'], price_day_cents: 800, price_week_cents: 3500,
    avail_days: [1, 2, 3, 4, 5], start_time: '07:00', end_time: '18:00',
    photos: ['assets/spots/driveway-1.svg'], rating: 4.9, review_count: 23,
  },
  {
    key: 'east-boulder-garage', lat: 40.013, lng: -105.262,
    title: 'East Boulder Garage',
    description: 'Covered single-car garage. Keeps your car out of the snow. Door code is shared after booking.',
    address: '2280 Sample Ave, Boulder, CO',
    city: 'Boulder', area: 'Goss-Grove', distance_mi: 0.5,
    spot_type: 'garage', covered: true, spot_count: 1,
    rent_options: ['day', 'week', 'month'], price_day_cents: 1200, price_week_cents: 5500, price_month_cents: 18000,
    avail_days: [0, 1, 2, 3, 4, 5, 6], start_time: '06:00', end_time: '22:00',
    photos: ['assets/spots/garage-1.svg'], rating: 4.7, review_count: 17,
  },
  {
    key: 'university-hill-spot', lat: 40.0035, lng: -105.2795,
    title: 'University Hill Spot',
    description: 'Off-street spot behind the house, under a big maple. Enter from the alley.',
    address: '955 Placeholder Pl, Boulder, CO',
    city: 'Boulder', area: 'University Hill', distance_mi: 0.6,
    spot_type: 'driveway', covered: false, spot_count: 1,
    rent_options: ['day', 'month'], price_day_cents: 1000, price_month_cents: 15000,
    avail_days: [1, 2, 3, 4, 5], start_time: '07:30', end_time: '17:30',
    photos: ['assets/spots/driveway-2.svg'], rating: 4.8, review_count: 29,
  },
  {
    key: 'cu-football-game-parking', lat: 39.9945, lng: -105.2545,
    title: 'CU Football Game Parking',
    description: 'Park and walk to Folsom Field on home game days. Tailgate-friendly front lawn.',
    address: '1701 Demo Dr, Boulder, CO',
    city: 'Boulder', area: 'Martin Acres', distance_mi: 1.3,
    spot_type: 'driveway', covered: false, spot_count: 3,
    rent_options: ['event'], price_event_cents: 2500,
    avail_days: [6], start_time: '08:00', end_time: '22:00',
    event_label: 'CU home game', eventDates: 'saturdays',
    photos: ['assets/spots/driveway-3.svg'], rating: 4.9, review_count: 48,
  },
  {
    key: 'goss-grove-lot', lat: 40.0125, lng: -105.2665,
    title: 'Goss-Grove Small Lot',
    description: 'Two spaces in a small private lot next to a duplex. Easy in, easy out for early classes.',
    address: '1420 Test Ct, Boulder, CO',
    city: 'Boulder', area: 'Goss-Grove', distance_mi: 0.3,
    spot_type: 'lot', covered: false, spot_count: 2,
    rent_options: ['day', 'week', 'month'], price_day_cents: 900, price_week_cents: 4000, price_month_cents: 14000,
    avail_days: [1, 2, 3, 4, 5], start_time: '07:00', end_time: '19:00',
    photos: ['assets/spots/lot-1.svg'], rating: 4.6, review_count: 12,
  },
  {
    key: 'martin-acres-driveway', lat: 39.9905, lng: -105.256,
    title: 'Martin Acres Driveway',
    description: 'Budget option on the bus line. About a 20 minute walk or a quick ride on the SKIP.',
    address: '3310 Mock Ln, Boulder, CO',
    city: 'Boulder', area: 'Martin Acres', distance_mi: 1.5,
    spot_type: 'driveway', covered: false, spot_count: 1,
    rent_options: ['day', 'week', 'month'], price_day_cents: 600, price_week_cents: 2500, price_month_cents: 8000,
    avail_days: [1, 2, 3, 4, 5], start_time: '06:30', end_time: '18:30',
    photos: ['assets/spots/driveway-4.svg'], rating: 4.5, review_count: 9,
  },
  {
    key: 'baseline-covered-carport', lat: 39.9995, lng: -105.2785,
    title: 'Baseline Covered Carport',
    description: 'Carport space near Baseline and Broadway. Covered from hail and snow.',
    address: '780 Sample Rd, Boulder, CO',
    city: 'Boulder', area: 'Chautauqua', distance_mi: 0.8,
    spot_type: 'other', covered: true, spot_count: 1,
    rent_options: ['day', 'week'], price_day_cents: 1100, price_week_cents: 5000,
    avail_days: [1, 2, 3, 4, 5, 6], start_time: '07:00', end_time: '20:00',
    photos: ['assets/spots/garage-2.svg'], rating: 4.8, review_count: 14,
  },
  {
    key: 'williams-village-driveway', lat: 39.996, lng: -105.244,
    title: 'Williams Village Driveway',
    description: 'Driveway close to Williams Village and the Buff Bus stop. Great for monthly commuters.',
    address: '505 Example Way, Boulder, CO',
    city: 'Boulder', area: 'Williams Village', distance_mi: 1.7,
    spot_type: 'driveway', covered: false, spot_count: 1,
    rent_options: ['week', 'month'], price_week_cents: 3000, price_month_cents: 11000,
    avail_days: [0, 1, 2, 3, 4, 5, 6], start_time: '06:00', end_time: '21:00',
    photos: ['assets/spots/driveway-5.svg'], rating: 4.7, review_count: 21,
  },
];

export function nextSaturdays(count = 3, gapDays = 14, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() + i * gapDays);
    out.push(isoDate(x));
  }
  return out;
}

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Neighborhoods near CU with approximate walking distance (mi) to Norlin Quad.
// Also each area's rough center, used to place a spot when its address can't be found on the map.
export const BOULDER_AREAS = {
  'University Hill': 0.4, 'Goss-Grove': 0.6, 'Chautauqua': 0.9, 'Whittier': 1.0,
  'Williams Village': 1.2, 'Downtown / Pearl St': 1.2, 'Martin Acres': 1.3, 'Mapleton Hill': 1.5,
  'Table Mesa': 2.2, 'East Boulder': 2.5, 'North Boulder': 3.0,
};
export const AREA_CENTERS = {
  'University Hill': [40.0050, -105.2780], 'Goss-Grove': [40.0125, -105.2640], 'Chautauqua': [39.9990, -105.2790],
  'Whittier': [40.0215, -105.2700], 'Williams Village': [39.9975, -105.2480], 'Downtown / Pearl St': [40.0175, -105.2800],
  'Martin Acres': [39.9920, -105.2550], 'Mapleton Hill': [40.0215, -105.2880], 'Table Mesa': [39.9850, -105.2500],
  'East Boulder': [40.0150, -105.2300], 'North Boulder': [40.0450, -105.2830],
};
