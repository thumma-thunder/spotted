# Spotted

Parking marketplace for CU Boulder: homeowners list driveways, garages and lots; commuters book them by the day, week, month or game day and pay the host with Venmo.

- **Website:** plain HTML, CSS and JavaScript in `public/`. No build step. Works on phones and desktops.
- **Hosting:** Netlify free plan.
- **Database, logins, photos:** Supabase free plan.
- **Payments:** Venmo QR. Spotted never touches the money.

Until Supabase is connected, the site runs in **demo mode**: everything works, but accounts, listings, bookings and messages are saved only in the visitor's own browser. The sample host confirms payments and replies to messages automatically, so you can click through the whole flow.

## How booking and payment work

Spotted collects every payment and keeps an 8% fee; owners get the other 92%.

1. A commuter searches by city, the CU building they want to park near, date, time and length, then books a spot.
2. The payment page shows a QR code for **Spotted's Venmo (@david-thumma)** with the amount and a booking code (like `SP-AF5D67`) filled in. The commuter pays, then taps **I've sent the payment**.
3. A Spotted team member opens the **Team** page, finds that booking code in Venmo and taps **Payment received**.
4. The spot owner sees the booking under **Confirm these bookings** on their Host page and taps **Confirm**. The commuter now sees the street address. If the owner taps **Decline**, the booking is cancelled and it shows under **Refunds to send** on the Team page; after refunding on Venmo, tap **I sent the refund**.
5. The Team page lists what each owner is owed (one Venmo per owner covers all their bookings). After sending it, tap **I sent $X on Venmo**. Owners see "Paid out" on their dashboard.

Owners see what they'll earn after the fee when they set prices, and their dashboard shows payouts on the way and paid out.

The database refuses double bookings, days the host doesn't offer, and dates that aren't listed game days. Only Spotted team members can confirm payments or record payouts and refunds, and only the spot's owner can confirm a booking.

### Spotted team members

The team page is at `/#/team`. To make someone a team member, have them sign up on the site, then run in Supabase SQL Editor:

```sql
insert into public.admins (user_id) select id from auth.users where email = 'their@email.com';
```

To change the Venmo account or the fee:

```sql
update public.platform_settings set venmo_username = 'new-handle', fee_bps = 800;  -- 800 = 8%
```

The fee is locked in on each booking when it's made, so changing it only affects new bookings.

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
   - `supabase/migrations/20261019000004_central_payments.sql` (Spotted Venmo, 8% fee, team page, payouts)
   - `supabase/migrations/20261028000005_owner_confirms.sql` (owners confirm paid bookings, refunds)
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
- Venmo personal accounts are meant for friends and family. Collecting payments for a business should go through a Venmo business profile, per Venmo's terms.
- Database tests: `tests/schema_test.sql` and `tests/payments_test.sql` run the booking, payment and security rules against a local Postgres with `tests/supabase_stub.sql` (each on a fresh database, with every migration except the photo storage one).
