-- =============================================================================
-- Solar Cleaning Co. — core schema
-- All money is stored as integer cents. All timestamps are timestamptz (UTC).
-- =============================================================================

create extension if not exists btree_gist;  -- needed for the no-double-booking constraint
create extension if not exists pgcrypto;    -- gen_random_uuid()

-- ---------- Enums ----------
create type public.user_role as enum ('owner', 'admin', 'technician', 'customer');
create type public.plan_kind as enum ('one_time', 'subscription', 'commercial');
create type public.billing_interval as enum ('one_time', 'month', 'year');
create type public.publish_status as enum ('draft', 'published', 'archived');
create type public.quote_status as enum ('new', 'needs_review', 'quoted', 'accepted', 'declined', 'expired', 'converted', 'out_of_area', 'waitlist');
create type public.booking_status as enum ('requested', 'confirmed', 'in_progress', 'completed', 'canceled', 'weather_hold', 'rescheduled', 'no_access');
create type public.entitlement_status as enum ('available', 'scheduled', 'completed', 'canceled', 'expired', 'adjusted');
create type public.entitlement_source as enum ('plan', 'one_time_purchase', 'manual_adjustment', 'goodwill');
create type public.photo_kind as enum ('before', 'after', 'damage', 'quote');
create type public.lead_kind as enum ('contact', 'commercial', 'neighborhood_group', 'installer_partner');

-- ---------- Shared helpers ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Business settings (single row, editable branding/contact) ----------
create table public.business_settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default 'Solar Cleaning Co.',
  tagline text,
  phone text,
  email text,
  headquarters_city text not null default 'Vacaville',
  headquarters_state text not null default 'CA',
  logo_url text,
  brand_colors jsonb not null default '{"navy":"#0b1b33","charcoal":"#1f2933","gold":"#e8b04a"}',
  -- Never displayed on the site unless the matching *_verified flag is true.
  license_info text,
  license_verified boolean not null default false,
  insurance_info text,
  insurance_verified boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger business_settings_updated before update on public.business_settings for each row execute function public.set_updated_at();

-- ---------- People ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'customer',
  first_name text,
  last_name text,
  email text,
  phone text,
  -- Marketing consent is separate from required transactional messages.
  marketing_email_opt_in boolean not null default false,
  marketing_sms_opt_in boolean not null default false,
  marketing_consent_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- ---------- Territories ----------
create table public.service_territories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  cities text[] not null default '{}',
  travel_fee_cents integer not null default 0 check (travel_fee_cents >= 0),
  is_active boolean not null default true,
  accepting_new boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger territories_updated before update on public.service_territories for each row execute function public.set_updated_at();

-- ---------- Plans and versioned prices ----------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind public.plan_kind not null,
  summary text,
  cleanings_per_year integer check (cleanings_per_year is null or cleanings_per_year >= 0),
  min_days_between_cleanings integer check (min_days_between_cleanings is null or min_days_between_cleanings >= 0),
  max_panels_included integer,
  priority_scheduling boolean not null default false,
  benefits jsonb not null default '[]',
  limitations jsonb not null default '[]',
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plans_updated before update on public.plans for each row execute function public.set_updated_at();

-- A price row is a versioned record. Published prices are never edited in place:
-- the owner publishes a new row and the old one is archived, so existing
-- subscriptions keep pointing at the exact price they agreed to.
create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete restrict,
  billing_interval public.billing_interval not null,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text not null default 'usd',
  status public.publish_status not null default 'draft',
  stripe_price_id text unique,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  -- Cannot publish without an amount: no checkout for unpriced plans.
  constraint published_requires_amount check (status <> 'published' or amount_cents is not null)
);
create unique index plan_prices_one_published on public.plan_prices (plan_id, billing_interval) where status = 'published';

create or replace function public.guard_plan_price_changes() returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' and (new.amount_cents is distinct from old.amount_cents
      or new.billing_interval is distinct from old.billing_interval
      or new.plan_id is distinct from old.plan_id
      or new.currency is distinct from old.currency) then
    raise exception 'Published or archived prices cannot be changed. Create a new price version instead.';
  end if;
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'Archived prices cannot be re-activated. Create a new price version instead.';
  end if;
  if new.status = 'published' and old.status = 'draft' then new.published_at = now(); end if;
  if new.status = 'archived' and old.status <> 'archived' then new.archived_at = now(); end if;
  return new;
end $$;
create trigger plan_prices_guard before update on public.plan_prices for each row execute function public.guard_plan_price_changes();

-- Quote engine configuration (see src/lib/pricing/engine.ts PricingConfig). Versioned.
create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  config jsonb not null,
  status public.publish_status not null default 'draft',
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create unique index pricing_rules_one_published on public.pricing_rules ((true)) where status = 'published';

-- ---------- Configurable policies (draft legal templates) ----------
create table public.policies (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  body_markdown text not null,
  version integer not null default 1,
  status public.publish_status not null default 'draft',
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (slug, version)
);

-- ---------- Customers' properties ----------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  territory_id uuid references public.service_territories (id),
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null default 'CA',
  postal_code text not null,
  property_type text not null,
  stories integer not null check (stories >= 1),
  roof_type text not null default 'unknown',
  panel_count integer not null check (panel_count >= 1),
  access_type text not null default 'unsure',
  -- Instructions the customer authorizes technicians to see (gate notes, pets, water spigot).
  technician_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index properties_customer_idx on public.properties (customer_id);
create trigger properties_updated before update on public.properties for each row execute function public.set_updated_at();

-- ---------- Quote requests ----------
create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  territory_id uuid references public.service_territories (id),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  panel_count integer not null check (panel_count >= 1),
  property_type text not null,
  stories integer not null check (stories >= 1),
  roof_type text not null,
  access_type text not null,
  access_details text,
  cleaning_request text not null,
  preferred_window text not null,
  photo_paths text[] not null default '{}',
  status public.quote_status not null default 'new',
  review_reasons text[] not null default '{}',
  -- Full engine output, including the owner-only internal estimate.
  engine_result jsonb,
  pricing_rules_version integer,
  approved_price_cents integer check (approved_price_cents is null or approved_price_cents >= 0),
  marketing_email_opt_in boolean not null default false,
  marketing_sms_opt_in boolean not null default false,
  referral_code text,
  source text,
  ip_hash text,
  follow_up_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quote_requests_status_idx on public.quote_requests (status, created_at desc);
create index quote_requests_ip_idx on public.quote_requests (ip_hash, created_at desc);
create index quote_requests_email_idx on public.quote_requests (lower(email));
create trigger quote_requests_updated before update on public.quote_requests for each row execute function public.set_updated_at();

-- ---------- Billing (Phase 3 fills these from verified Stripe webhooks) ----------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete restrict,
  property_id uuid not null references public.properties (id) on delete restrict,
  plan_id uuid not null references public.plans (id),
  -- The exact price version the customer agreed to.
  plan_price_id uuid not null references public.plan_prices (id),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  -- California automatic renewal law: record express consent and the terms shown.
  auto_renew_consent_at timestamptz,
  consent_terms_version integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_customer_idx on public.subscriptions (customer_id);
create trigger subscriptions_updated before update on public.subscriptions for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles (id) on delete set null,
  subscription_id uuid references public.subscriptions (id),
  booking_id uuid,
  stripe_payment_intent_id text unique,
  stripe_invoice_id text unique,
  amount_cents integer not null,
  refunded_cents integer not null default 0,
  currency text not null default 'usd',
  status text not null,
  created_at timestamptz not null default now()
);
create index payments_customer_idx on public.payments (customer_id);

-- Every Stripe webhook event id is stored once; replays are ignored.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

-- ---------- Scheduling ----------
create table public.technicians (
  id uuid primary key references public.profiles (id) on delete cascade,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.technician_territories (
  technician_id uuid not null references public.technicians (id) on delete cascade,
  territory_id uuid not null references public.service_territories (id) on delete cascade,
  primary key (technician_id, territory_id)
);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid references public.technicians (id) on delete cascade, -- null = company-wide
  weekday smallint not null check (weekday between 0 and 6),            -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create table public.blackout_dates (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid references public.technicians (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete restrict,
  property_id uuid not null references public.properties (id) on delete restrict,
  quote_request_id uuid references public.quote_requests (id),
  subscription_id uuid references public.subscriptions (id),
  technician_id uuid references public.technicians (id),
  territory_id uuid references public.service_territories (id),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  travel_buffer_minutes integer not null default 30 check (travel_buffer_minutes >= 0),
  -- Maintained by trigger: scheduled_end + travel buffer.
  blocked_until timestamptz not null,
  status public.booking_status not null default 'requested',
  cancel_reason text,
  customer_notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start),
  -- One technician cannot be in two places at once (including travel buffer).
  constraint bookings_no_double_booking exclude using gist (
    technician_id with =,
    tstzrange(scheduled_start, blocked_until, '[)') with &&
  ) where (technician_id is not null and status in ('requested', 'confirmed', 'in_progress'))
);
create or replace function public.set_booking_blocked_until() returns trigger language plpgsql as $$
begin new.blocked_until = new.scheduled_end + make_interval(mins => new.travel_buffer_minutes); return new; end $$;
create trigger bookings_blocked_until before insert or update on public.bookings for each row execute function public.set_booking_blocked_until();
create index bookings_customer_idx on public.bookings (customer_id);
create index bookings_tech_start_idx on public.bookings (technician_id, scheduled_start);
create trigger bookings_updated before update on public.bookings for each row execute function public.set_updated_at();
alter table public.payments add constraint payments_booking_fk foreign key (booking_id) references public.bookings (id);

-- ---------- Cleaning entitlements (separate from billing) ----------
-- A ledger: each row is one included cleaning. Paying does not equal a cleaning.
create table public.service_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete restrict,
  subscription_id uuid references public.subscriptions (id),
  source public.entitlement_source not null,
  status public.entitlement_status not null default 'available',
  valid_from date not null,
  valid_until date not null,
  booking_id uuid unique references public.bookings (id),
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until >= valid_from),
  -- A scheduled or completed entitlement must be tied to the booking that used it.
  check (status not in ('scheduled', 'completed') or booking_id is not null)
);
create index entitlements_customer_idx on public.service_entitlements (customer_id, status);
create trigger entitlements_updated before update on public.service_entitlements for each row execute function public.set_updated_at();

-- ---------- Job execution ----------
create table public.job_reports (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  technician_id uuid not null references public.technicians (id),
  safety_checklist jsonb not null default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  service_notes text,
  damage_reported boolean not null default false,
  damage_notes text,
  unsafe_conditions text,
  updated_at timestamptz not null default now()
);
create trigger job_reports_updated before update on public.job_reports for each row execute function public.set_updated_at();

create table public.job_photos (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind public.photo_kind not null,
  storage_path text not null,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------- Marketing ----------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  kind public.lead_kind not null,
  name text not null,
  email text not null,
  phone text,
  company text,
  city text,
  panel_estimate integer,
  message text,
  status text not null default 'new',
  ip_hash text,
  created_at timestamptz not null default now()
);
create index leads_ip_idx on public.leads (ip_hash, created_at desc);

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  percent_off integer check (percent_off between 1 and 100),
  amount_off_cents integer check (amount_off_cents > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  max_redemptions integer,
  redemptions integer not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  check ((percent_off is null) <> (amount_off_cents is null))
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references public.profiles (id) on delete set null,
  code text not null unique,
  referred_email text,
  quote_request_id uuid references public.quote_requests (id),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- ---------- Audit log for financial and membership changes ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_table_idx on public.audit_log (table_name, created_at desc);

create or replace function public.write_audit_log() returns trigger language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data)
  values (
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    lower(tg_op), tg_table_name, rec ->> 'id',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

create trigger audit_plan_prices after insert or update or delete on public.plan_prices for each row execute function public.write_audit_log();
create trigger audit_pricing_rules after insert or update or delete on public.pricing_rules for each row execute function public.write_audit_log();
create trigger audit_subscriptions after insert or update or delete on public.subscriptions for each row execute function public.write_audit_log();
create trigger audit_payments after insert or update or delete on public.payments for each row execute function public.write_audit_log();
create trigger audit_entitlements after insert or update or delete on public.service_entitlements for each row execute function public.write_audit_log();
create trigger audit_plans after insert or update or delete on public.plans for each row execute function public.write_audit_log();
create trigger audit_profiles_role after update of role on public.profiles for each row execute function public.write_audit_log();

-- ---------- New auth users get a customer profile ----------
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
