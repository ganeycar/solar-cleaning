-- =============================================================================
-- Row Level Security and privileges
--
-- Principles:
--  * Every table has RLS enabled. No policy = no access.
--  * The browser (anon / authenticated roles) gets the minimum it needs.
--  * Customer-facing writes that need validation, rate limiting, or Stripe
--    confirmation go through server code using the service role, which
--    bypasses RLS and is never exposed to the browser.
--  * Technicians see only jobs assigned to them, and never billing data.
-- =============================================================================

-- Role helpers. SECURITY DEFINER so policies can read profiles without recursion.
create or replace function public.current_user_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner', 'admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_assigned_technician(p_booking_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings b where b.id = p_booking_id and b.technician_id = auth.uid())
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.is_staff() from public;
revoke all on function public.is_assigned_technician(uuid) from public;
grant execute on function public.current_user_role(), public.is_assigned_technician(uuid) to authenticated, service_role;
-- Public catalog policies call is_staff(), so anonymous visitors need it too (it returns false for them).
grant execute on function public.is_staff() to anon, authenticated, service_role;

-- Start from zero for browser roles, then grant precisely.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Enable RLS everywhere.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------- Public, read-only catalog ----------
grant select on public.business_settings, public.plans, public.service_territories, public.policies, public.plan_prices to anon, authenticated;

create policy "settings readable by all" on public.business_settings for select using (true);
create policy "active plans readable by all" on public.plans for select using (is_active or public.is_staff());
create policy "active territories readable by all" on public.service_territories for select using (is_active or public.is_staff());
create policy "published policies readable by all" on public.policies for select using (status = 'published' or public.is_staff());
-- Draft prices stay private until the owner publishes them.
create policy "published prices readable by all" on public.plan_prices for select using (status = 'published' or public.is_staff());

-- ---------- Staff manage everything ----------
grant select, insert, update, delete on all tables in schema public to authenticated;
-- (Row access is still controlled by the policies below; tables without a
-- matching policy remain inaccessible.)
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, update, delete on public.stripe_events from authenticated;
revoke insert, update, delete on public.payments from authenticated;
revoke insert, update, delete on public.subscriptions from authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'business_settings','plans','plan_prices','pricing_rules','policies','service_territories',
    'properties','quote_requests','technicians','technician_territories','availability_rules',
    'blackout_dates','bookings','service_entitlements','job_reports','job_photos','leads',
    'promo_codes','referrals'
  ] loop
    execute format('create policy "staff full access" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- Billing tables: staff read; writes only from verified server code (service role).
create policy "staff read subscriptions" on public.subscriptions for select to authenticated using (public.is_staff());
create policy "staff read payments" on public.payments for select to authenticated using (public.is_staff());
create policy "staff read stripe events" on public.stripe_events for select to authenticated using (public.is_staff());
create policy "staff read audit log" on public.audit_log for select to authenticated using (public.is_staff());

-- ---------- Profiles ----------
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
-- Technicians may see the name/phone of customers on their assigned jobs.
create policy "technician reads assigned customers" on public.profiles for select to authenticated using (
  exists (select 1 from public.bookings b where b.customer_id = profiles.id and b.technician_id = auth.uid())
);
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "staff update profiles" on public.profiles for update to authenticated using (public.is_staff()) with check (public.is_staff());
-- Users can never change their own role: only these columns are updatable from the browser.
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, phone, marketing_email_opt_in, marketing_sms_opt_in, marketing_consent_updated_at) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;

-- ---------- Customer-owned records ----------
create policy "customer reads own properties" on public.properties for select to authenticated using (customer_id = auth.uid());
create policy "customer updates own properties" on public.properties for update to authenticated using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy "technician reads assigned properties" on public.properties for select to authenticated using (
  exists (select 1 from public.bookings b where b.property_id = properties.id and b.technician_id = auth.uid())
);

create policy "customer reads own quotes" on public.quote_requests for select to authenticated using (customer_id = auth.uid());
create policy "customer reads own subscriptions" on public.subscriptions for select to authenticated using (customer_id = auth.uid());
create policy "customer reads own payments" on public.payments for select to authenticated using (customer_id = auth.uid());
create policy "customer reads own entitlements" on public.service_entitlements for select to authenticated using (customer_id = auth.uid());
create policy "customer reads own bookings" on public.bookings for select to authenticated using (customer_id = auth.uid());
create policy "customer reads own job reports" on public.job_reports for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = job_reports.booking_id and b.customer_id = auth.uid())
);
create policy "customer reads own job photos" on public.job_photos for select to authenticated using (
  kind in ('before', 'after', 'damage') and exists (select 1 from public.bookings b where b.id = job_photos.booking_id and b.customer_id = auth.uid())
);
create policy "customer reads own referrals" on public.referrals for select to authenticated using (referrer_id = auth.uid());

-- ---------- Technicians ----------
create policy "technician reads own record" on public.technicians for select to authenticated using (id = auth.uid());
create policy "technician reads assigned bookings" on public.bookings for select to authenticated using (technician_id = auth.uid());
create policy "technician reads own job reports" on public.job_reports for select to authenticated using (technician_id = auth.uid());
create policy "technician writes own job reports" on public.job_reports for insert to authenticated with check (technician_id = auth.uid() and public.is_assigned_technician(booking_id));
create policy "technician updates own job reports" on public.job_reports for update to authenticated using (technician_id = auth.uid()) with check (technician_id = auth.uid() and public.is_assigned_technician(booking_id));
create policy "technician reads job photos" on public.job_photos for select to authenticated using (public.is_assigned_technician(booking_id));
create policy "technician uploads job photos" on public.job_photos for insert to authenticated with check (
  uploaded_by = auth.uid() and kind in ('before', 'after', 'damage') and public.is_assigned_technician(booking_id)
);

-- Anything not granted above (e.g. anon inserting quote requests directly) is denied.
-- Public form submissions go through validated server actions using the service role.
