# Solar Cleaning Co. — website and operating platform

Website, quoting, memberships, scheduling, and dashboards for a solar panel cleaning business based in Vacaville, CA.

**Status: Phase 1 of 6.** Public site, design system, quote form, pricing engine, and the full database schema are built. Nothing is deployed, and no payments are possible yet.

## Tech

Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage) · Stripe (Phase 3) · Vercel · Resend (Phase 6)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the system design and the phase plan.

## Run it on your computer

You need **Node.js 20.9 or newer** ([nodejs.org](https://nodejs.org), choose LTS).

```bash
git clone https://github.com/ganeycar/solar-cleaning.git
cd solar-cleaning
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The site runs **without Supabase** using default content. The quote and contact forms will say they aren't connected until you complete the next step.

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine for development).
2. Apply the database schema. Either:
   - **Easiest:** In the Supabase dashboard, open *SQL Editor* and run each file in `supabase/migrations/` in filename order, then run `supabase/seed.sql`.
   - **CLI:** `npx supabase link --project-ref <your-ref>` then `npx supabase db push`, then run `seed.sql` in the SQL editor.
3. In *Project Settings → API*, copy the Project URL, `anon` key, and `service_role` key into `.env.local`.
4. Set `RATE_LIMIT_SALT` to any long random string.
5. Restart `npm run dev`. Submit a test quote, then look at the `quote_requests` table in Supabase.

Make yourself the owner (after you create an account in Phase 2):

```sql
update public.profiles set role = 'owner' where email = 'you@yourdomain.com';
```

## Tests

```bash
npm test         # pricing engine + form validation (Node's built-in test runner)
npm run test:db  # applies all migrations to a throwaway local Postgres and runs RLS/constraint tests
npm run typecheck
npm run build
```

`test:db` needs Postgres 15+ installed locally (`brew install postgresql@16` on Mac). It's optional; it's how the schema was verified during development.

## Prices

There are **no prices in the code**. Every plan starts with a *draft* price slot and no amount:

- The site shows "Pricing coming soon" and "Request a quote" until a price is published.
- The database refuses to publish a price without an amount.
- A published price can't be edited. Publishing a new price creates a new version, so existing members keep the price they agreed to.
- The quote engine's settings live in the `pricing_rules` table. Until a version is published, quotes are saved and estimated internally but customers never see a number.

The owner dashboard (Phase 5) will provide screens for all of this. Until then, prices can be set in the Supabase table editor, though there's no need to yet.

## Replacing placeholders

- **Photos:** Pages show styled placeholders labeled "Photo: …". Add your own photos to `public/images/` and pass `src="/images/your-photo.jpg"` to the `PhotoSlot` component on that page. Use photos of your own work.
- **Business name, phone, email, colors, logo:** the `business_settings` table.
- **License / insurance:** enter them in `business_settings` and set `license_verified` / `insurance_verified` to true. They're never shown otherwise.
- **City pages:** `src/content/cities.ts`. **FAQ:** `src/content/faq.ts`.
- **Legal pages:** `src/app/legal/*`. These are drafts with [bracketed] blanks. Have a California attorney review them.

## Deploying (when you're ready — not before)

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Add the variables from `.env.example` in *Settings → Environment Variables*.
3. Keep `NEXT_PUBLIC_SITE_INDEXABLE=false` until launch; that tells search engines not to index the site.

## Security notes

- Row Level Security is on for every table. Customers see only their own records; technicians see only assigned jobs and never billing.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is used only in server code. Never prefix it with `NEXT_PUBLIC_`.
- `.env*` files are git-ignored. Don't commit keys.
- Form submissions are validated on the server, rate limited by hashed IP, and protected with a honeypot. Uploaded photos are checked by their actual bytes, renamed, and stored in a private bucket.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Public site, design system, quote form, pricing engine, database schema | **Built** (see "Phase 1 verification" below) |
| 2 | Customer accounts (Supabase Auth) and customer dashboard | Not started |
| 3 | Stripe test-mode checkout, subscriptions, billing portal, pricing controls | Not started |
| 4 | Booking, availability, entitlements, rescheduling | Schema ready, logic not started |
| 5 | Owner and technician dashboards | Not started |
| 6 | Email, reporting, lead follow-up, SEO, launch prep | Not started |

### Phase 1 verification

What was actually tested:

- **Pricing engine:** 9 unit tests (tiers, surcharges, minimums, discounts, unpublished pricing, manual-review triggers, out-of-area, waitlist).
- **Form validation:** 6 unit tests (normalization, field errors, honeypot, phone parsing, image byte sniffing).
- **Database:** all migrations and seed applied to Postgres 16 with 12 test groups covering RLS for anonymous visitors, customers, technicians, and the owner; price immutability; double-booking prevention with travel buffers; entitlement rules; and the audit log.
- **Syntax:** all 39 TypeScript/TSX files parse cleanly; business-logic files pass a strict type check.

What was **not** tested yet: `npm install`, `next build`, and running the site in a browser. The development environment couldn't reach the npm registry. Run `npm install && npm run build` first and report any errors so they can be fixed. Supabase Storage uploads and the server actions against a real Supabase project are also untested until a project is connected.
