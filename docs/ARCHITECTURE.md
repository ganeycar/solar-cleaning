# Architecture

## Overview

```
Browser ──► Next.js on Vercel
              ├─ Server Components: public pages (read catalog with anon key, RLS applies)
              ├─ Server Actions: quote + lead forms (validate → rate limit → service role write)
              ├─ Route handlers (Phase 3): Stripe webhooks (signature verified, deduplicated)
              └─ Auth (Phase 2): Supabase Auth via @supabase/ssr cookie sessions
                     │
                     ▼
            Supabase: Postgres (RLS on every table) · Auth · Storage (private buckets)
                     │
          Stripe (Checkout, Billing, Customer Portal) · Resend (email) · Google Calendar (optional)
```

## Key design decisions

**Pricing is data, not code.** Plans (`plans`), their prices (`plan_prices`), and quote rules (`pricing_rules`) are rows the owner edits. Prices are versioned: published rows are immutable (enforced by trigger), only one price per plan and interval can be published (partial unique index), and a price can't be published without an amount (check constraint). Each subscription points at the exact `plan_price_id` it was sold at.

**Billing and cleanings are separate.** `subscriptions` and `payments` record money; `service_entitlements` is a ledger with one row per included cleaning (available → scheduled → completed, or canceled/expired/adjusted). A booking consumes exactly one entitlement (`booking_id` unique). Stripe payments create entitlements only after verified webhooks, never because a browser reached a success page.

**Safety-first quoting.** The pricing engine (`src/lib/pricing/engine.ts`) is pure and unit-tested. It returns one of: `priced`, `needs_review`, `pricing_unpublished`, `out_of_area`, `waitlist`. Unknown roofs, uncertain access, roof walking, commercial jobs, and anything above configurable thresholds always go to `needs_review`. A customer only sees a number for `priced`.

**Territories are one source of truth.** `service_territories` holds cities, travel fees, and whether each is accepting new customers. The engine reads zones from it.

**No double-booking.** A Postgres exclusion constraint prevents overlapping active bookings for the same technician, including the travel buffer after each job.

**Least-privilege access.**
| Role | Can see |
|---|---|
| Anonymous | Business settings, active plans, territories, published prices, published policies |
| Customer | Their own profile, properties, quotes, subscriptions, payments, entitlements, bookings, job reports and photos |
| Technician | Their assigned bookings, those properties and customers' names/phone, job reports and photos they own. No billing, no quotes. |
| Owner/Admin | Everything |

Users can't change their own `role` (column-level privileges). Browser roles can't write billing tables at all; those are written only by server code after Stripe confirmation.

**Audit log.** Triggers record every insert/update/delete on plans, prices, pricing rules, subscriptions, payments, entitlements, and role changes.

**California automatic renewal.** `subscriptions` stores `auto_renew_consent_at` and `consent_terms_version`. Phase 3 checkout will show renewal terms next to an unchecked consent box, send an acknowledgment email, and offer online cancellation in the portal.

## Data model

| Table | Purpose |
|---|---|
| `business_settings` | Single row: name, contact, colors, logo, license/insurance (shown only when verified) |
| `profiles` | One per auth user: role, contact, marketing consent (separate for email and SMS) |
| `service_territories` | Cities, travel fee, active / accepting new |
| `plans`, `plan_prices` | Catalog and versioned prices |
| `pricing_rules` | Versioned quote-engine configuration |
| `policies` | Configurable policy text with versions and approval |
| `properties` | Customer service addresses and system details |
| `quote_requests` | Every quote, with engine output and review reasons |
| `subscriptions`, `payments`, `stripe_events` | Billing mirror of Stripe; `stripe_events` deduplicates webhooks |
| `technicians`, `technician_territories`, `availability_rules`, `blackout_dates` | Scheduling capacity |
| `bookings` | Appointments with technician, territory, buffer, status |
| `service_entitlements` | Cleaning ledger |
| `job_reports`, `job_photos` | Safety checklist, notes, damage reports, before/after photos |
| `leads`, `promo_codes`, `referrals` | Marketing |
| `audit_log` | Change history |

## Phase plan

1. **Public site and foundations** — done.
2. **Accounts** — Supabase Auth with `@supabase/ssr`, a session refresh proxy, login/sign-up, customer dashboard reading through RLS, linking past quotes by verified email.
3. **Payments** — Stripe Checkout (one-time and subscription), webhook route handler with signature verification and `stripe_events` dedupe, Customer Portal, owner pricing screens that create Stripe Prices when publishing.
4. **Scheduling** — availability calculation from rules, blackouts, existing bookings and buffers; entitlement issuance per billing period; booking, rescheduling and weather holds; Google Calendar sync.
5. **Dashboards** — owner (KPIs, MRR/ARR, customers, quotes review, pricing, manual bookings) and technician (assigned jobs, checklist, photo upload, damage reports).
6. **Launch** — Resend transactional email, reminders, abandoned-quote follow-up, review requests, reporting, Google Business Profile guidance, final SEO.
