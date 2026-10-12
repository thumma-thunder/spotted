# Spotted

Spotted is a responsive campus-parking marketplace website. Commuters can search by city, CU Boulder building, date, and parking duration; hosts can list one or many spaces and set their price; members can message about a listing and manage bookings.

## Netlify and free-tier setup

The static website and serverless endpoints deploy on Netlify. Supabase supplies Postgres and email/password authentication on its free plan; Stripe Connect handles card checkout and host payouts. Supabase's free projects include 500 MB of database storage and can pause after a week without activity. Netlify's free-plan allowances and Stripe processing fees apply. This setup has no required paid monthly app subscription, but free tiers have limits and payment processors charge per transaction.

### 1. Create the Supabase database

1. Create a Supabase project on the [free plan](https://supabase.com/pricing/).
2. Install or run the Supabase CLI, then link this repository to the new project's reference:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   The migration in `supabase/migrations/` creates the profile, spot, booking, inbox, and payment-event schema, plus row-level security policies. Public search uses a safe view that never returns a host's street address. The address is returned to the renter only after a booking is paid and confirmed.
3. In Supabase **Project Settings → API Keys**, copy the project URL, publishable key, and server-only secret key. Keep the secret key private.
4. In **Authentication → URL Configuration**, set the site URL to the Netlify site's HTTPS URL. Add that URL to the allowed redirect URLs so account confirmation links return to the site.

### 2. Set up Stripe Connect

1. Create a Stripe account and enable Connect with Express accounts. Hosts enter bank and identity information on Stripe-hosted onboarding pages; Spotted never collects it.
2. For a test deployment, use Stripe test-mode credentials. Add a webhook endpoint at `https://YOUR_SITE/api/stripe-webhook` and subscribe to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
3. Copy the webhook signing secret. Use Stripe's test cards until your platform and Connect account have been verified. Stripe's processing fees apply to successful charges.

### 3. Deploy to Netlify

1. Import this repository from GitHub in Netlify. The checked-in `netlify.toml` publishes the site and routes `/api/*` requests to Netlify Functions.
2. Set these environment variables in **Site configuration → Environment variables**. Use the Supabase secret key only for server-side functions.

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_PUBLISHABLE_KEY` | Supabase public publishable key |
   | `SUPABASE_SECRET_KEY` | Supabase private secret key |
   | `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_…` for testing) |
   | `STRIPE_WEBHOOK_SECRET` | Stripe endpoint signing secret (`whsec_…`) |

3. Deploy the site. No client-side card or bank data, Stripe secret, or Supabase secret key is placed in the published files.

### Local preview

Open `index.html` to review the responsive preview listings. They are sample content and cannot be booked, messaged, or published. To test live functions locally, copy `.env.example` to `.env`, fill in test credentials, link the Supabase project, apply its migration, and run:

```powershell
node scripts/build.mjs
npx netlify-cli dev
```

Never use live Stripe keys in a local `.env` or commit `.env`; keep all real credentials in Netlify's environment-variable settings.
