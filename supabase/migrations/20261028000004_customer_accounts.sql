-- =============================================================================
-- Phase 2: customer accounts
-- =============================================================================

-- Links quote requests submitted before sign-up to the new account.
-- Only works for a CONFIRMED email address, and only matches that exact email,
-- so nobody can claim someone else's quotes by typing their address.
create or replace function public.claim_my_quotes() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_count integer;
begin
  select lower(email) into v_email
  from auth.users
  where id = auth.uid() and email_confirmed_at is not null;

  if v_email is null then
    return 0;
  end if;

  update public.quote_requests
  set customer_id = auth.uid()
  where customer_id is null and lower(email) = v_email;
  get diagnostics v_count = row_count;

  -- Prefill an empty profile from the most recent quote.
  update public.profiles p
  set first_name = coalesce(p.first_name, q.first_name),
      last_name  = coalesce(p.last_name, q.last_name),
      phone      = coalesce(p.phone, q.phone)
  from (
    select first_name, last_name, phone
    from public.quote_requests
    where customer_id = auth.uid()
    order by created_at desc
    limit 1
  ) q
  where p.id = auth.uid();

  return v_count;
end $$;

revoke all on function public.claim_my_quotes() from public, anon;
grant execute on function public.claim_my_quotes() to authenticated;

-- Customers may edit only the instructions they give technicians. Address,
-- panel count, roof and access details affect pricing and safety, so changes to
-- those go through a reviewed server-side flow (staff dashboard, Phase 5).
revoke update on public.properties from authenticated;
grant update (technician_instructions) on public.properties to authenticated;
