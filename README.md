# Solar Cleaning Co. — website and operating platform

Website, quoting, memberships, scheduling, and dashboards for a solar panel cleaning business based in Vacaville, CA.

**Status: Phase 3 of 6.** Public site, quote form, pricing engine, database, customer accounts and dashboard, Stripe checkout and memberships (test mode), and owner pricing tools are built. Nothing is deployed, and live payments are blocked until you approve them.

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

## Customer accounts (Phase 2)

Sign-in is passwordless: customers enter their email and Supabase sends a one-time link.

1. Run `supabase/migrations/20261028000004_customer_accounts.sql` in the Supabase SQL Editor (once).
2. In Supabase, go to **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:3000` for now (your real domain at launch).
   - **Redirect URLs:** add `http://localhost:3000/**` (and later `https://yourdomain.com/**`).
3. Visit `/login`, enter your email, and click the link in the email **in the same browser**.

Past quote requests made with the same email are linked to the account automatically, but only after the email is confirmed.

Make yourself the owner after your first sign-in:

```sql
update public.profiles set role = 'owner' where email = 'you@yourdomain.com';
```

**Before launch:** Supabase's built-in email service is for testing only. It sends a few emails per hour and may only deliver to your own team's addresses. Phase 6 connects Resend as the email provider so customers receive sign-in emails reliably.

## Payments and owner tools (Phase 3)

### One-time setup

1. Run `supabase/migrations/20261028000005_billing.sql` in the Supabase SQL Editor (once).
2. Put your Stripe **test** keys in `.env.local` (`STRIPE_SECRET_KEY=sk_test_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`). The app refuses `sk_live_` keys unless `STRIPE_LIVE_MODE_APPROVED=true`.
3. Forward Stripe webhooks to your computer with the Stripe CLI:
   ```bash
   brew install stripe/stripe-cli/stripe   # or download from github.com/stripe/stripe-cli/releases
   stripe login
   stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,charge.refunded --forward-to localhost:3000/api/stripe/webhook
   ```
   (Newer Stripe CLI versions require the `--events` list. These are exactly the events the app handles. Subscribe the same events when you add the production webhook endpoint in the Stripe dashboard.)
   Copy the `whsec_…` value it prints into `.env.local` as `STRIPE_WEBHOOK_SECRET=`, restart `npm run dev`, and leave `stripe listen` running in its own Terminal tab while testing.

### Owner tools (`/admin`, owner or admin role only)

- **Quotes:** review requests, see photos and the engine's estimate, approve a price (the customer can then book and pay online) or decline.
- **Plans & prices:** prices start as private drafts; publishing makes them live and, for memberships, creates the matching Stripe price. Published prices are never edited: a new version replaces them, and existing members keep their price. Edit plan names, benefits, limits, and panel caps.
- **Quote pricing & areas:** base price, per-panel tiers, story and ladder charges, minimums, membership discounts, review rules, travel fees, and which cities accept new customers. Each save is a new version; "Save and publish" turns on instant prices.

### How payment works

- Customers book from **Book now** on a quote in their dashboard (`/checkout/<quote>`).
- One-time cleanings charge the quote's approved price. Memberships charge the plan's published price and are offered only when the system fits the plan's panel limit.
- Memberships show the automatic-renewal terms next to an unchecked consent box; the exact disclosure, time, and terms version are stored with the subscription (keep for at least 3 years).
- **Nothing is marked paid from the browser.** Only verified Stripe webhooks record payments, create the customer's property, mark the quote booked, and (for one-time cleanings) add one cleaning credit valid for 12 months. Each Stripe event is processed once.
- Members manage cards, see receipts, switch plans, and cancel online through Stripe's billing portal (configured automatically; cancellation takes effect at the end of the period).
- Test card: `4242 4242 4242 4242`, any future date, any CVC, any ZIP.

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
| 2 | Customer accounts (Supabase Auth) and customer dashboard | **Built** |
| 3 | Stripe test-mode checkout, subscriptions, billing portal, pricing controls | **Built** |
| 4 | Booking, availability, entitlements, rescheduling | Schema ready, logic not started |
| 5 | Owner and technician dashboards | Not started |
| 6 | Email, reporting, lead follow-up, SEO, launch prep | Not started |

### Phase 1 verification

What was actually tested:

- **Pricing engine:** 9 unit tests (tiers, surcharges, minimums, discounts, unpublished pricing, manual-review triggers, out-of-area, waitlist).
- **Form validation:** 6 unit tests (normalization, field errors, honeypot, phone parsing, image byte sniffing).
- **Database:** all migrations and seed applied to Postgres 16 with 12 test groups covering RLS for anonymous visitors, customers, technicians, and the owner; price immutability; double-booking prevention with travel buffers; entitlement rules; and the audit log.
- **Syntax:** all 39 TypeScript/TSX files parse cleanly; business-logic files pass a strict type check.

Confirmed by the owner on a real machine: `npm install`, `next build` (all 26 routes), and a quote submission saved to Supabase.

### Phase 2 verification

- **Database:** 2 new test groups. Quotes link to an account only for a confirmed email that matches exactly (case-insensitive); unconfirmed or anonymous users can't claim anything; linking is idempotent and prefills the profile. Customers can edit only the technician instructions on their own property, never panel count or address.
- **Unit tests:** 17 total, including Supabase URL normalization.
- Confirmed by the owner on a real machine: sign-in email, account linking, and the dashboard.

### Phase 3 verification

- **Database (5 new test groups, 19 total):** only the owner can publish prices or pricing versions; publishing archives the previous version and keeps its amount; published pricing versions can't be edited; the public can't read internal Stripe ids; paid quotes create exactly one property and only from server code; cleaning credits can't be issued twice.
- **Unit tests (30 total):** checkout eligibility (unpriced, unpublished, unsynced, over-panel-limit, unreviewed quotes are all blocked), renewal disclosure content and length, live-key refusal, reading Stripe objects across API versions, dollar parsing, the owner pricing form, and the engine's safety floor (unknown roofs and uncertain or roof access are always reviewed, whatever the settings say).
- **Type check:** all app code was checked against simplified stand-ins for Next.js, Supabase and Stripe, which caught and fixed one real error.
- Confirmed by the owner on a real machine: `npm run build` with the Stripe package, owner tools, publishing prices to Stripe, instant quote pricing, and a one-time test payment confirmed by webhook (payment and cleaning credit recorded).

### Open decision before Phase 4

How members earn included cleanings (all at the start of the membership year, or spread across it, e.g. Seasonal Care's second cleaning after six months of payments) affects what happens if someone cancels early. Phase 4 issues membership cleanings according to that choice.
