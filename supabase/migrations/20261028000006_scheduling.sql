-- =============================================================================
-- Phase 4: scheduling, bookings, and membership cleaning entitlements
-- =============================================================================

-- Owner-editable scheduling settings (hours, job length, buffers, notice).
-- Defaults live in the app (src/lib/scheduling/slots.ts); {} means "use defaults".
alter table public.business_settings add column if not exists scheduling jsonb not null default '{}';
-- Secret token for the owner's private calendar subscription link. Never public.
alter table public.business_settings add column if not exists calendar_token text;
grant select (scheduling) on public.business_settings to anon, authenticated;

-- Anchor for membership years (Stripe subscription start date).
alter table public.subscriptions add column if not exists started_at timestamptz;

create index if not exists entitlements_subscription_idx on public.service_entitlements (subscription_id, status);
create index if not exists bookings_status_start_idx on public.bookings (status, scheduled_start);

-- ---------- Book a cleaning (server code only) ----------
-- Atomically: checks the cleaning credit and property belong to the customer
-- and the credit is valid on that day, creates the booking (the database's
-- exclusion rule rejects double-booking), and marks the credit scheduled.
create or replace function public.book_cleaning(
  p_customer uuid, p_entitlement uuid, p_property uuid, p_technician uuid,
  p_start timestamptz, p_end timestamptz, p_buffer_minutes integer, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare e public.service_entitlements%rowtype; pr public.properties%rowtype; v_day date; v_booking uuid;
begin
  v_day := (p_start at time zone 'America/Los_Angeles')::date;

  select * into e from public.service_entitlements where id = p_entitlement for update;
  if e.id is null or e.customer_id <> p_customer or e.status <> 'available' or v_day < e.valid_from or v_day > e.valid_until then
    raise exception 'CLEANING_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select * into pr from public.properties where id = p_property;
  if pr.id is null or pr.customer_id <> p_customer then
    raise exception 'PROPERTY_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.bookings (customer_id, property_id, subscription_id, technician_id, territory_id,
                               scheduled_start, scheduled_end, travel_buffer_minutes, status, customer_notes, created_by)
  values (p_customer, p_property, e.subscription_id, p_technician, pr.territory_id,
          p_start, p_end, p_buffer_minutes, 'confirmed', p_notes, p_customer)
  returning id into v_booking;

  update public.service_entitlements set status = 'scheduled', booking_id = v_booking where id = e.id;
  return v_booking;
end $$;

-- ---------- Reschedule (server code only) ----------
create or replace function public.reschedule_booking(
  p_customer uuid, p_booking uuid, p_technician uuid, p_start timestamptz, p_end timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype; v_day date;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or (p_customer is not null and b.customer_id <> p_customer) or b.status not in ('requested', 'confirmed', 'weather_hold', 'rescheduled') then
    raise exception 'BOOKING_NOT_CHANGEABLE' using errcode = 'P0001';
  end if;
  v_day := (p_start at time zone 'America/Los_Angeles')::date;
  if exists (select 1 from public.service_entitlements where booking_id = p_booking and (v_day < valid_from or v_day > valid_until)) then
    raise exception 'OUTSIDE_CLEANING_VALIDITY' using errcode = 'P0001';
  end if;
  update public.bookings
  set scheduled_start = p_start, scheduled_end = p_end, technician_id = p_technician, status = 'confirmed'
  where id = p_booking;
end $$;

-- ---------- Cancel (server code only) ----------
-- p_return_cleaning = true gives the cleaning credit back (customer cancels in
-- time, weather, our scheduling issue). false = the cleaning counts as used
-- (e.g. no access at the agreed time, per policy).
create or replace function public.cancel_booking(
  p_booking uuid, p_reason text, p_return_cleaning boolean, p_customer uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or (p_customer is not null and b.customer_id <> p_customer) or b.status in ('completed', 'canceled', 'no_access') then
    raise exception 'BOOKING_NOT_CHANGEABLE' using errcode = 'P0001';
  end if;

  if p_return_cleaning then
    update public.bookings set status = 'canceled', cancel_reason = p_reason where id = p_booking;
    update public.service_entitlements set status = 'available', booking_id = null where booking_id = p_booking;
  else
    update public.bookings set status = 'no_access', cancel_reason = p_reason where id = p_booking;
    update public.service_entitlements set status = 'completed', note = coalesce(note || ' · ', '') || 'Used: ' || coalesce(p_reason, 'no access')
    where booking_id = p_booking;
  end if;
end $$;

-- ---------- Complete (server code only) ----------
create or replace function public.complete_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.status not in ('confirmed', 'in_progress', 'requested', 'rescheduled') then
    raise exception 'BOOKING_NOT_CHANGEABLE' using errcode = 'P0001';
  end if;
  update public.bookings set status = 'completed' where id = p_booking;
  update public.service_entitlements set status = 'completed' where booking_id = p_booking;
end $$;

revoke all on function public.book_cleaning(uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text),
  public.reschedule_booking(uuid, uuid, uuid, timestamptz, timestamptz),
  public.cancel_booking(uuid, text, boolean, uuid),
  public.complete_booking(uuid) from public, anon, authenticated;
grant execute on function public.book_cleaning(uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text),
  public.reschedule_booking(uuid, uuid, uuid, timestamptz, timestamptz),
  public.cancel_booking(uuid, text, boolean, uuid),
  public.complete_booking(uuid) to service_role;
