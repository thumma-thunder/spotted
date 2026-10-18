# Spotted

Parking marketplace for CU Boulder: homeowners list driveways, garages and lots; commuters book them by the day, week, month or game day and pay the host with Venmo.

- **Website:** plain HTML, CSS and JavaScript in `public/`. No build step. Works on phones and desktops.
- **Hosting:** Netlify free plan.
- **Database, logins, photos:** Supabase free plan.
- **Payments:** Venmo QR. Spotted never touches the money.

Until Supabase is connected, the site runs in **demo mode**: everything works, but accounts, listings, bookings and messages are saved only in the visitor's own browser. The sample host confirms payments and replies to messages automatically, so you can click through the whole flow.

## How booking and payment work

1. A commuter searches by city, the CU building they want to park near, date, time and length, then books a spot. Picking a building sorts spots by distance to it.
2. The payment page shows a QR code that opens the host's Venmo with the amount and a booking code (like `SP-AF5D67`) filled in. The commuter pays, then taps **I've sent the payment**.
3. The host checks Venmo and taps **Payment received** on their dashboard.
4. The commuter now sees the street address. Addresses stay hidden until then.

The database refuses double bookings, days the host doesn't offer, and dates that aren't listed game days. Commuters and hosts can chat about any spot.

## Put it online

### 1. Netlify (free)

1. In Netlify, **Add new site → Import an existing project**, pick this GitHub repo and this branch.
2. Leave the build command empty. Set the publish directory to `public` (already set in `netlify.toml`).
3. Deploy. The site is live in demo mode.

### 2. Supabase (free)

1. Create a project at [supabase.com](https://supabase.com) (free plan).
2. Open **SQL Editor**, then paste and run each file in order:
   - `supabase/migrations/20261018000001_spotted.sql` (tables, security rules, booking logic)
   - `supabase/migrations/20261018000002_spot_photos.sql` (photo storage)
   - `supabase/migrations/20261018000003_spot_locations.sql` (map location of each spot)
3. **Authentication → URL Configuration:** set the Site URL to your Netlify URL.
4. Optional, for easier testing: **Authentication → Sign In / Providers → Email**, turn off **Confirm email**. Leave it on for real launch.
5. **Project Settings → API:** copy the Project URL and the publishable (anon) key.

### 3. Connect the site

Paste both values into `public/js/config.js`, commit and push. Netlify redeploys automatically and the demo-mode banner disappears.

The publishable key is meant to be public. The database's row-level security rules decide who can read and change what. Never put the `service_role` or secret key in the website.

### 4. Add the placeholder spots

1. On the live site, create an account for the team (the seed file expects `spottedparking@outlook.com`; change the email at the top of the file if you use another).
2. In **Host a Spot → Payouts**, add the team's Venmo username.
3. In Supabase SQL Editor, run `supabase/seed_sample_spots.sql`. This adds 8 sample spots around CU owned by the team account. Re-running it replaces them.

Sample spots are labeled "Sample listing". Bookings on them go to the team account to confirm. Delete them from the dashboard once real hosts sign up.

## Editing

| What | Where |
| --- | --- |
| Pages | `public/js/pages/` (one file per page) |
| Colors, fonts, layout | `public/css/styles.css` (colors at the top) |
| Sample spots | `public/js/samples.js`, then `npm run seed` to regenerate the SQL |
| Suggested-price formula | `public/js/pricing.js` |
| CU building list for search | `public/js/buildings.js` (locations from OpenStreetMap) |
| Hero and spot illustrations | `public/assets/` (swap in real photos, e.g. `hero.jpg`, and update `styles.css`) |

Preview locally from the repo root with `npx serve public` or `python3 -m http.server -d public`, then open the printed address.

## Free-plan notes

- Supabase pauses free projects after about a week with no activity. Opening the dashboard resumes it.
- Venmo personal accounts are meant for friends and family. Hosts charging for parking regularly should use a Venmo business profile, per Venmo's terms.
- Database tests: `tests/schema_test.sql` runs the booking and security rules against a local Postgres with `tests/supabase_stub.sql`.
