# Spotted

Spotted is a responsive campus-parking marketplace website. Commuters can search by city, CU Boulder building, date, and parking duration; hosts can list one or many spaces and set their price; members can message about a listing and manage bookings.

## Netlify and Supabase setup

The static website and serverless endpoints deploy on Netlify. Supabase supplies Postgres and email/password authentication. Parking payments go directly from renters to hosts through Venmo; Spotted does not process or hold funds. Free-tier limits and Venmo's own terms apply.

### 1. Create the Supabase database

1. Create a Supabase project on the [free plan](https://supabase.com/pricing/).
2. Install or run the Supabase CLI, then link this repository to the new project's reference:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   The migration in `supabase/migrations/` creates the profile, spot, booking, inbox, and payment-status schema, plus row-level security policies. Public search does not return hosts' street addresses. A renter sees the address only after the host confirms payment.
3. In Supabase **Project Settings → API Keys**, copy the project URL, publishable key, and server-only secret key. Keep the secret key private.
4. In **Authentication → URL Configuration**, set the site URL to the Netlify site's HTTPS URL and add that URL to allowed redirect URLs.

### 2. Deploy to Netlify

1. Import this repository from GitHub in Netlify. `netlify.toml` builds the static site and routes `/api/*` to Netlify Functions.
2. Set these environment variables in **Site configuration → Environment variables**:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_PUBLISHABLE_KEY` | Supabase public publishable key |
   | `SUPABASE_SECRET_KEY` | Supabase private secret key; server-side only |

3. Deploy the site. The Supabase secret key is not included in the published files.

### Venmo payments

Hosts add their Venmo username when listing a space. Renters receive a QR code and Venmo app link for the exact amount and booking reference, pay the host directly, then mark the payment as sent. Hosts must check Venmo and confirm receipt before the booking is confirmed and the parking address is revealed. Spotted cannot verify, reverse, or protect direct Venmo payments. Hosts should use an account type Venmo allows for payments for goods or services.

The QR image is rendered by QRServer and contains the host's public Venmo username, amount, and a short booking reference. Payment is initiated through Venmo's `venmo://paycharge` link. Do not include sensitive information in the Venmo username or payment note.

### Local preview

Open `index.html` to review the responsive preview listings. They are sample content and cannot be booked, messaged, or published. To test live functions locally, copy `.env.example` to `.env`, fill in Supabase credentials, link the Supabase project, apply its migration, and run:

```powershell
node scripts/build.mjs
npx netlify-cli dev
```

Run the credential-free booking function tests with:

```powershell
node --test tests/create-booking.test.mjs
```

Never commit `.env`; keep the Supabase secret key in Netlify's environment-variable settings for hosted deployments.
