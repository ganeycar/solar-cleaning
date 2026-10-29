-- =============================================================================
-- Phase 3: payments, memberships, and pricing controls
-- =============================================================================

-- Stripe identifiers. These are specific to test mode or live mode; the app
-- re-creates them automatically if they are missing in the current mode.
alter table public.plans add column if not exists stripe_product_id text;
alter table public.profiles add column if not exists stripe_customer_id text unique;
alter table public.business_settings add column if not exists stripe_portal_config_id text;

-- California Automatic Renewal Law: keep the exact disclosure the customer
-- agreed to (retain at least 3 years, or 1 year after the membership ends).
alter table public.subscriptions add column if not exists consent_disclosure text;
alter table public.subscriptions add column if not exists quote_request_id uuid references public.quote_requests (id);

-- Makes entitlement issuing idempotent (e.g. one cleaning per paid checkout).
alter table public.service_entitlements add column if not exists source_ref text unique;

-- Payments can be matched to refunds by charge as well.
alter table public.payments add column if not exists stripe_charge_id text unique;
alter table public.payments add column if not exists description text;

-- The portal configuration id is internal; keep it out of the public API.
revoke select on public.business_settings from anon, authenticated;
grant select (id, business_name, tagline, phone, email, headquarters_city, headquarters_state, logo_url, brand_colors,
              license_info, license_verified, insurance_info, insurance_verified, updated_at)
  on public.business_settings to anon, authenticated;

-- ---------- Publish a plan price version (staff only) ----------
-- Archives the currently published price for the same plan and billing
-- interval, then publishes the new one, in one transaction. Existing
-- subscriptions keep pointing at the price version they agreed to.
create or replace function public.publish_plan_price(p_price_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_plan uuid; v_interval public.billing_interval; v_status public.publish_status; v_amount integer;
begin
  if not public.is_staff() then raise exception 'Only the owner can publish prices.' using errcode = '42501'; end if;

  select plan_id, billing_interval, status, amount_cents into v_plan, v_interval, v_status, v_amount
  from public.plan_prices where id = p_price_id for update;

  if v_plan is null then raise exception 'Price not found.'; end if;
  if v_status <> 'draft' then raise exception 'Only draft prices can be published.'; end if;
  if v_amount is null then raise exception 'Enter an amount before publishing.'; end if;

  update public.plan_prices set status = 'archived'
  where plan_id = v_plan and billing_interval = v_interval and status = 'published';

  update public.plan_prices set status = 'published' where id = p_price_id;
end $$;

-- Takes a published price off the website without replacing it.
create or replace function public.unpublish_plan_price(p_price_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only the owner can change prices.' using errcode = '42501'; end if;
  update public.plan_prices set status = 'archived' where id = p_price_id and status = 'published';
end $$;

-- ---------- Publish quote-engine rules (staff only) ----------
create or replace function public.publish_pricing_rules(p_rules_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only the owner can publish pricing.' using errcode = '42501'; end if;
  if not exists (select 1 from public.pricing_rules where id = p_rules_id) then raise exception 'Pricing version not found.'; end if;
  update public.pricing_rules set status = 'archived' where status = 'published' and id <> p_rules_id;
  update public.pricing_rules set status = 'published', published_at = now() where id = p_rules_id;
end $$;

create or replace function public.unpublish_pricing_rules() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only the owner can change pricing.' using errcode = '42501'; end if;
  update public.pricing_rules set status = 'archived' where status = 'published';
end $$;

revoke all on function public.publish_plan_price(uuid), public.unpublish_plan_price(uuid),
  public.publish_pricing_rules(uuid), public.unpublish_pricing_rules() from public, anon;
grant execute on function public.publish_plan_price(uuid), public.unpublish_plan_price(uuid),
  public.publish_pricing_rules(uuid), public.unpublish_pricing_rules() to authenticated;

-- ---------- Create the customer's property from a paid quote ----------
-- Called only by verified server code (Stripe webhooks). Locks the quote row so
-- two webhook events arriving at once can't create duplicate properties.
create or replace function public.ensure_property_for_quote(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare q public.quote_requests%rowtype; v_property uuid;
begin
  select * into q from public.quote_requests where id = p_quote_id for update;
  if q.id is null then raise exception 'Quote % not found', p_quote_id; end if;
  if q.customer_id is null then raise exception 'Quote % is not linked to a customer account', p_quote_id; end if;
  if q.property_id is not null then return q.property_id; end if;

  insert into public.properties (customer_id, territory_id, address_line1, address_line2, city, state, postal_code,
                                 property_type, stories, roof_type, panel_count, access_type, technician_instructions)
  values (q.customer_id, q.territory_id, q.address_line1, q.address_line2, q.city, q.state, q.postal_code,
          q.property_type, q.stories, q.roof_type, q.panel_count, q.access_type, q.access_details)
  returning id into v_property;

  update public.quote_requests set property_id = v_property where id = p_quote_id;
  return v_property;
end $$;

revoke all on function public.ensure_property_for_quote(uuid) from public, anon, authenticated;
grant execute on function public.ensure_property_for_quote(uuid) to service_role;

-- Published or archived quote-pricing versions are history: quotes record which
-- version priced them, so those versions can't be edited in place.
create or replace function public.guard_pricing_rules_changes() returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' and (new.config is distinct from old.config or new.version is distinct from old.version) then
    raise exception 'Published or archived pricing versions cannot be edited. Save a new version instead.';
  end if;
  if old.status = 'archived' and new.status = 'draft' then
    raise exception 'Archived pricing versions cannot return to draft.';
  end if;
  return new;
end $$;
drop trigger if exists pricing_rules_guard on public.pricing_rules;
create trigger pricing_rules_guard before update on public.pricing_rules for each row execute function public.guard_pricing_rules_changes();
