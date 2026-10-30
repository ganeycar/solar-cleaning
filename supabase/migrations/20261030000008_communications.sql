-- =============================================================================
-- Phase 6: email, follow-ups, reporting, launch prep
-- =============================================================================

-- Every email the system sends (or skips), keyed so the same message is never
-- sent twice, even when a webhook or the daily job runs again.
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  idem_key text not null unique,
  kind text not null,
  to_email text not null,
  subject text not null,
  customer_id uuid references public.profiles (id) on delete set null,
  related_id uuid,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped', 'suppressed')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists email_log_created_idx on public.email_log (created_at desc);
create index if not exists email_log_related_idx on public.email_log (related_id);
alter table public.email_log enable row level security;
drop policy if exists "staff read email log" on public.email_log;
create policy "staff read email log" on public.email_log for select using (public.is_staff());

-- People who unsubscribed from optional emails (follow-ups, review requests).
-- Required notices (receipts, appointment and renewal notices) still go out.
create table if not exists public.email_suppressions (
  email text primary key check (email = lower(email)),
  reason text not null default 'unsubscribed',
  created_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
drop policy if exists "staff read suppressions" on public.email_suppressions;
create policy "staff read suppressions" on public.email_suppressions for select using (public.is_staff());

-- The daily job records each run so the owner can see it's working.
create table if not exists public.job_runs (
  name text primary key,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_result jsonb,
  last_error text
);
alter table public.job_runs enable row level security;
drop policy if exists "staff read job runs" on public.job_runs;
create policy "staff read job runs" on public.job_runs for select using (public.is_staff());

-- Where happy customers leave a review (Google review link), and the mailing
-- address that must appear in marketing emails (CAN-SPAM). Server-only.
alter table public.business_settings add column if not exists review_url text;
alter table public.business_settings add column if not exists mailing_address text;

-- How many follow-up emails a quote has received.
alter table public.quote_requests add column if not exists follow_up_count integer not null default 0;

-- Browser roles: read-only, and RLS limits reads to staff. Writes happen only on the server.
revoke all on public.email_log, public.email_suppressions, public.job_runs from anon, authenticated;
grant select on public.email_log, public.email_suppressions, public.job_runs to authenticated;
