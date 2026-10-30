# Solano Solar Cleaning — website and operating platform

Website, quoting, memberships, scheduling, and dashboards for a solar panel cleaning business based in Vacaville, CA.

**Status: all 6 phases built.** Public site, quotes, customer accounts, Stripe checkout and memberships (test mode), owner pricing tools, online booking with cleaning tracking, the owner dashboard, the technician phone app, automatic emails, lead follow-up, and launch tools. Nothing is deployed, and live payments are blocked until you approve them. Next: visual redesign, then launch.

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

## Booking and scheduling (Phase 4)

### One-time setup

1. Run `supabase/migrations/20261028000006_scheduling.sql` in the Supabase SQL Editor (once).
2. Go to **/admin/schedule** and click **I'll do the cleanings myself** (customers can't book until a technician exists).
3. Set your working hours, job timing, and days off on the same page.

### How it works

- Customers with an available cleaning click **Schedule a cleaning** on their dashboard, pick a day and arrival time, and are booked instantly.
- Offered times respect your hours, days off, minimum notice, job length (base + minutes per panel), and travel buffer. The database independently refuses double-bookings.
- Customers can reschedule or cancel online until the cutoff (default 24 hours before). Canceling in time returns the cleaning.
- Memberships with a minimum gap between cleanings (e.g. Unlimited Care, 30 days) are enforced.
- **How members earn cleanings:** yearly billing includes the whole year's cleanings up front. Monthly billing unlocks them as months are paid: after paying month *m* of the membership year a member has earned ⌈m × N ÷ 12⌉ (Seasonal: months 1 and 7; Premium: 1, 4, 7, 10; Unlimited: every month). Cleanings expire at the end of the membership year. Earned only when Stripe confirms payment.
- One-time purchases include one cleaning valid for 12 months.
- Owner tools (**/admin/schedule**): upcoming appointments with customer notes, **Completed**, **Weather: cancel & return cleaning**, and **No access** (cleaning counts as used); a private calendar subscription link for Apple or Google Calendar.

## Owner dashboard and technician app (Phase 5)

### One-time setup

1. Run `supabase/migrations/20261029000007_operations.sql` in the Supabase SQL Editor (once).
2. Go to **/admin/business** and fill in your details. Enter your **cost per cleaning** (private) to see profit estimates.

### Owner tools (/admin)

- **Overview:** active members, monthly recurring revenue, past-due and ending memberships, new and canceled members, failed payments, revenue by plan and by city, and estimated profit per plan (last 30, 90, or 365 days).
- **Customers:** search by name, email, or phone. Each customer page shows cleanings (add a goodwill cleaning), manual booking, appointments with service reports, memberships with the recorded auto-renewal consent, payments, contact details, properties (edit), and quotes.
- **Business:** name, phone, email, colors, logo, license and insurance (shown on the site only when you tick "confirmed"), Google/Yelp/Facebook links, and your team. Add a helper by email after they've signed in once; deactivate them anytime (not while they have upcoming jobs).

### Technician app (/tech, made for phones)

- Today's and the next 7 days' jobs, each with directions, tap-to-call, the property details, customer notes, and what equipment to bring.
- A required safety checklist before **Start job**.
- Before, after, and issue photos taken from the phone's camera (resized on the phone so uploads stay small); service notes; existing-damage and unsafe-condition notes.
- **Complete job** needs at least one before and one after photo. **Stop for safety** returns the customer's cleaning; **No access** uses it.
- Technicians see only their own jobs: never payments, prices, or other customers.

### Customers

- Completed cleanings in **Service history** have a **Photos & report** page with before-and-after photos, notes, and anything the technician noticed. It prints or saves as a PDF.

## Emails, follow-up, and launch tools (Phase 6)

### One-time setup

1. Run `supabase/migrations/20261030000008_communications.sql` in the Supabase SQL Editor (once).
2. In Resend, create an API key (**API Keys → Create**, "Sending access"). Add to `.env.local`:
   ```
   RESEND_API_KEY=re_...
   EMAIL_TEST_TO=the-email-you-signed-up-to-resend-with
   CRON_SECRET=any-long-random-string
   ```
   Leave `EMAIL_FROM` empty until your domain is verified. Restart `npm run dev`.
3. On **/admin/business**, add your mailing address (a PO box is fine) and, later, your Google review link.
4. On **/admin/launch**, click **Send me a test email**.

**Test mode:** with `EMAIL_TEST_TO` set, every email goes to you, and the subject shows who it was meant for (`[TEST to customer@…]`). Resend's test sender can't reach anyone else anyway.

### What gets sent

| When | To | Email |
|---|---|---|
| Quote submitted | Customer | Received (with price if auto-priced) |
| Quote submitted | Owner | New quote alert |
| One-time payment confirmed | Customer | Payment received, schedule your cleaning |
| Membership starts | Customer | **Acknowledgment with renewal terms and how to cancel** (California law) |
| Membership payment fails | Customer + owner | Update your card |
| Booked / rescheduled / canceled | Customer (+ owner if the customer did it) | Confirmation with arrival time and prep tips |
| Day before appointment | Customer | Reminder |
| Weather cancel / stopped for safety | Customer | Cleaning returned, rebook |
| No access | Customer + owner | Visit counted as used |
| Job completed | Customer | Photos and report link, plus review request if a review link is set |
| 2 and 7 days after an unbooked priced quote | Customer | Follow-up (unsubscribe link, max 2) |
| 15–40 days before a yearly renewal | Customer | Renewal notice (California law) |
| Before each membership anniversary (monthly plans) | Customer | Yearly reminder of terms and how to cancel |
| Cleanings expiring within 30 days | Customer | Schedule before they expire |

- Every email is recorded on **Leads & emails** and is sent at most once, even if a payment notice or the daily job repeats.
- Email problems never block a booking or payment.
- Unsubscribing stops only optional follow-ups; appointment, payment, and legally required notices still go out.
- Stripe can also send its own receipts: Stripe dashboard → **Settings → Customer emails → Successful payments**.

### Daily job

`/api/cron/daily` sends reminders, follow-ups, and notices. Once deployed, Vercel runs it every morning (`vercel.json`, 16:00 UTC ≈ 8–9 am Pacific) using `CRON_SECRET`. On your computer, use **Run daily job now** on the Launch page. Running it twice never sends duplicates.

### Owner tools

- **Leads & emails:** quote requests, auto-priced vs. needing review, booked, close rate, follow-up wins, city breakdown (including out-of-area demand), quotes waiting on you, priced-but-unbooked quotes, and every email sent.
- **Launch:** a live checklist of what's set up and what's left, plus test buttons.

## Launch guide (only after you approve)

1. **Name and domain:** choose the name, buy the domain, register the fictitious business name, set it on the Business page.
2. **Email domain:** Resend → **Domains → Add domain**, add the DNS records it shows at your domain registrar, wait for "Verified". Then set `EMAIL_FROM="Your Business <hello@yourdomain.com>"`, `EMAIL_REPLY_TO` to the inbox you read, and remove `EMAIL_TEST_TO`.
3. **Sign-in emails:** Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP with Resend (host `smtp.resend.com`, port 465, user `resend`, password = a Resend API key, sender = your domain address). Supabase's built-in sender only reaches your own team.
4. **Deploy:** import the repo at [vercel.com/new](https://vercel.com/new), add every variable from `.env.example` (with `NEXT_PUBLIC_SITE_URL=https://yourdomain.com`), deploy, then add your domain in Vercel → **Settings → Domains**.
5. **Supabase URLs:** Authentication → **URL Configuration**: Site URL `https://yourdomain.com`; add `https://yourdomain.com/**` to Redirect URLs.
6. **Stripe:** finish business verification. In **test mode** first, add a webhook endpoint `https://yourdomain.com/api/stripe/webhook` with the same events as the `stripe listen` command, put its signing secret in Vercel, and run a test purchase on the live site.
7. **Go live (your approval):** switch to live Stripe keys, a live webhook secret, and `STRIPE_LIVE_MODE_APPROVED=true`; re-publish prices in live mode on Plans & prices; set `NEXT_PUBLIC_SITE_INDEXABLE=true`; redeploy.
8. **After launch:** check **/admin/launch** shows everything done, submit `/sitemap.xml` in Google Search Console, and follow the "Getting found" checklist.

## Getting found on Google and AI search

Google's guidance (May 2026) is that optimizing for AI search *is* regular SEO: helpful first-hand content, clear structure, real images, accurate business information. Separate AI files (like `llms.txt`) and AI-only markup aren't needed.

**Built into the site:** server-rendered pages with clear headings and unique titles; six city pages with genuinely different local content and local FAQs; conversational FAQ answers; structured data for the business (service area, services, hours from your schedule, published prices only), each city's service, FAQs, and breadcrumbs; a sitemap; a branded share image. Search engines are blocked until `NEXT_PUBLIC_SITE_INDEXABLE=true` at launch.

**Launch checklist (owner):**
1. **Google Business Profile:** create it as a service-area business (hide the home address), list the same cities, use the exact business name and phone shown on the site, add many real photos, and keep hours current.
2. **Reviews:** ask every happy customer, reply to every review (good and bad). Reviews are a key source for AI recommendations. Phase 6 adds automatic review-request emails.
3. **Consistency:** the same name, phone, website, and service area on Yelp, Nextdoor, Bing Places, Apple Business Connect, Facebook, and the Vacaville Chamber of Commerce.
4. **Mentions:** local news, community groups, installer partners, and neighborhood associations linking to or naming the business.
5. **Real content:** add your own photos, and occasional short posts answering questions customers actually ask you.
6. **Check it:** after launch, verify the site in Google Search Console and submit `/sitemap.xml`. Every few weeks, ask ChatGPT, Gemini, and Perplexity "who cleans solar panels in Vacaville?" and note which sources they cite.

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

Prices are set and published from **/admin/pricing** (plans) and **/admin/settings** (quote pricing and areas).

## Replacing placeholders

- **Photos:** Pages show styled placeholders labeled "Photo: …". Add your own photos to `public/images/` and pass `src="/images/your-photo.jpg"` to the `PhotoSlot` component on that page. Use photos of your own work.
- **Business name, phone, email, colors, logo, review link, mailing address:** the **Business** page in owner tools.
- **License / insurance:** enter them on the Business page and tick "confirmed". They're never shown otherwise.
- **City pages:** `src/content/cities.ts`. **FAQ:** `src/content/faq.ts`.
- **Legal pages:** `src/app/legal/*`. These are drafts with [bracketed] blanks. Have a California attorney review them.

## Deploying

See the **Launch guide** above. Keep `NEXT_PUBLIC_SITE_INDEXABLE=false` until launch day.

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
| 4 | Booking, availability, entitlements, rescheduling | **Built** |
| 5 | Owner and technician dashboards | **Built** |
| 6 | Email, reporting, lead follow-up, SEO, launch prep | **Built** |

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

### Decisions made

- Membership cleanings are spread through the year for monthly billing (owner's choice, 28 Oct 2026). Note: a monthly member's first cleaning unlocks with the first payment, so someone could pay one month, use one cleaning, and cancel. If that becomes a problem, options include a minimum term (disclosed at checkout) or unlocking the first cleaning after the second payment.

### Phase 6 verification

- **Unit tests (64 total):** every email's content (escaping of customer-entered text, prices only when published, the California membership acknowledgment's terms and cancellation instructions, unsubscribe links and mailing address only on optional emails, review button only when set, Pacific times); reminder timing across midnight; follow-up timing (day 2, day 7, never after 30 days); renewal and yearly-reminder windows; expiring cleanings; signed unsubscribe links; the lead funnel; and the launch checklist (never exposes secret values).
- **Database (1 new group, 28 total):** email keys can't repeat; unsubscribes are stored lowercase; the email log, unsubscribes, and job runs are owner-only; the review link and mailing address aren't public.
- Confirmed by the owner (30 Oct 2026): migration, and a test email delivered through Resend.
- Not yet verified: the event emails end to end, Vercel's daily scheduled run, and one-click unsubscribe in Gmail.

### Phase 5 verification

- **Unit tests (50 total):** membership revenue math (monthly and yearly values, MRR, ARR, revenue by plan and city, refunds, windows), profit per plan, and the business-settings form (colors, links, verified flags only when filled).
- **Database (3 new groups, 27 total):** technicians can start and complete only their own jobs; completion requires before and after photos and uses the cleaning; technicians see only their own jobs, addresses, and photos; customers see photos of only their own jobs; inactive technicians can't be assigned jobs; your cost figures are never public.
- Confirmed by the owner on a real machine (29 Oct 2026): build, migration, Overview, Business, Customers (goodwill cleaning, manual booking), the technician flow with photos, and the customer report.
- Not yet verified: photo upload from a phone camera (after deployment).

### Phase 4 verification

- **Unit tests (43 total):** Pacific-time conversion across both daylight-saving changes, job length, minimum notice, opening hours, double-booking with travel buffer and multiple technicians, closed days and days off, change cutoff, schedule settings form, membership-year math (short months, Stripe timing slack), the cleaning-unlock schedule for every plan, and the calendar feed format.
- **Database (5 new groups, 24 total):** customers can't call booking functions directly; a booking uses exactly one valid cleaning, never another customer's cleaning or property, and never outside its dates; double-bookings inside the travel buffer are rejected and leave the cleaning untouched; reschedules are limited to the booking's customer and the cleaning's dates; canceling in time returns the cleaning, while no-access and completion use it; the calendar link token is never public.
- Not yet verified on a real machine: the booking pages, the owner schedule page, membership cleanings issued from real Stripe invoices, and the calendar feed in a calendar app.
