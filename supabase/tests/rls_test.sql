-- Database behaviour tests. Each block raises an exception on failure.
\set ON_ERROR_STOP on
\set QUIET on

-- Fixture users (run as superuser)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'alice@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'bob@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'tech@test.local');
update public.profiles set role = 'owner' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set role = 'technician' where id = '00000000-0000-0000-0000-00000000000d';
insert into public.technicians (id, display_name) values ('00000000-0000-0000-0000-00000000000d', 'Tech One');

insert into public.properties (id, customer_id, address_line1, city, postal_code, property_type, stories, panel_count)
values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', '1 Alice Way', 'Vacaville', '95687', 'single_family', 1, 20),
       ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000c', '2 Bob Rd', 'Vacaville', '95688', 'single_family', 2, 30);

insert into public.bookings (id, customer_id, property_id, technician_id, scheduled_start, scheduled_end, travel_buffer_minutes, status)
values ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-00000000000d', '2027-04-05 16:00+00', '2027-04-05 18:00+00', 30, 'confirmed');

insert into public.payments (customer_id, amount_cents, status, stripe_payment_intent_id)
values ('00000000-0000-0000-0000-00000000000b', 15000, 'succeeded', 'pi_test_1');

\echo 'T1 anonymous visitors see plans and territories but no draft prices'
set role anon;
do $$ begin
  assert (select count(*) from public.plans) = 5, 'anon should see 5 plans';
  assert (select count(*) from public.service_territories) = 6, 'anon should see 6 territories';
  assert (select count(*) from public.plan_prices) = 0, 'anon must not see draft prices';
end $$;

\echo 'T2 anonymous visitors cannot read pricing rules, quotes, or write anything'
do $$ begin
  begin perform * from public.pricing_rules; raise exception 'FAIL: anon read pricing_rules';
  exception when insufficient_privilege then null; end;
  begin perform * from public.quote_requests; raise exception 'FAIL: anon read quotes';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.quote_requests (first_name,last_name,email,phone,address_line1,city,state,postal_code,panel_count,property_type,stories,roof_type,access_type,cleaning_request,preferred_window)
    values ('x','y','x@y.z','+17075550100','1 St','Vacaville','CA','95687',10,'single_family',1,'unknown','unsure','one_time','flexible');
    raise exception 'FAIL: anon inserted quote';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

\echo 'T3 prices cannot be published without an amount, and published prices are immutable'
do $$
declare pid uuid;
begin
  select pp.id into pid from public.plan_prices pp join public.plans p on p.id = pp.plan_id where p.slug = 'one-time';
  begin update public.plan_prices set status = 'published' where id = pid; raise exception 'FAIL: published without amount';
  exception when check_violation then null; end;
  update public.plan_prices set amount_cents = 19900, status = 'published' where id = pid;
  begin update public.plan_prices set amount_cents = 9900 where id = pid; raise exception 'FAIL: edited a published price';
  exception when raise_exception then
    if sqlerrm not like 'Published or archived prices%' then raise; end if;
  end;
  assert (select published_at is not null from public.plan_prices where id = pid), 'published_at should be set';
end $$;

\echo 'T4 published prices become visible to the public'
set role anon;
do $$ begin
  assert (select count(*) from public.plan_prices where amount_cents = 19900) = 1, 'anon should see the published price';
end $$;
reset role;

\echo 'T5 only one published price per plan and interval'
do $$
declare plan uuid;
begin
  select id into plan from public.plans where slug = 'one-time';
  begin
    insert into public.plan_prices (plan_id, billing_interval, amount_cents, status) values (plan, 'one_time', 25000, 'published');
    raise exception 'FAIL: two published prices';
  exception when unique_violation then null; end;
end $$;

\echo 'T6 customers only see their own records'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.properties) = 1, 'alice should see only her property';
  assert (select count(*) from public.bookings) = 1, 'alice should see her booking';
  assert (select count(*) from public.payments) = 1, 'alice should see her payment';
  assert (select count(*) from public.profiles) = 1, 'alice should see only her profile';
  assert (select count(*) from public.pricing_rules) = 0, 'customers must not see pricing rules';
  assert (select count(*) from public.audit_log) = 0, 'customers must not see audit log';
end $$;

\echo 'T7 customers cannot promote themselves'
do $$ begin
  begin update public.profiles set role = 'owner' where id = auth.uid(); raise exception 'FAIL: self-promotion';
  exception when insufficient_privilege then null; end;
  update public.profiles set first_name = 'Alice' where id = auth.uid();
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from public.properties) = 1, 'bob should see only his property';
  assert (select count(*) from public.bookings) = 0, 'bob must not see alice''s booking';
  assert (select count(*) from public.payments) = 0, 'bob must not see alice''s payment';
  update public.properties set technician_instructions = 'hacked' where id = '10000000-0000-0000-0000-0000000000a1';
end $$;
reset role;
do $$ begin
  assert (select technician_instructions from public.properties where id = '10000000-0000-0000-0000-0000000000a1') is null, 'bob must not edit alice''s property';
end $$;

\echo 'T8 technicians see assigned jobs and addresses, never billing'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  assert (select count(*) from public.bookings) = 1, 'tech should see assigned booking';
  assert (select count(*) from public.properties) = 1, 'tech should see only the assigned property';
  assert (select count(*) from public.payments) = 0, 'tech must not see payments';
  assert (select count(*) from public.subscriptions) = 0, 'tech must not see subscriptions';
  assert (select count(*) from public.quote_requests) = 0, 'tech must not see quotes';
  insert into public.job_reports (booking_id, technician_id, service_notes) values ('20000000-0000-0000-0000-0000000000a1', auth.uid(), 'Test note');
end $$;
reset role;

\echo 'T9 the owner sees everything'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.properties) = 2, 'owner sees all properties';
  assert (select count(*) from public.payments) = 1, 'owner sees payments';
  assert (select count(*) from public.pricing_rules) = 1, 'owner sees pricing rules';
  assert (select count(*) from public.plan_prices) = 7, 'owner sees all 7 price slots, including drafts';
end $$;
reset role;

\echo 'T10 technicians cannot be double-booked, including travel buffer'
do $$ begin
  begin
    insert into public.bookings (customer_id, property_id, technician_id, scheduled_start, scheduled_end, status)
    values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000d',
            '2027-04-05 18:15+00', '2027-04-05 19:00+00', 'confirmed');
    raise exception 'FAIL: booking inside travel buffer accepted';
  exception when exclusion_violation then null; end;
  -- After the 30-minute buffer is fine.
  insert into public.bookings (customer_id, property_id, technician_id, scheduled_start, scheduled_end, status)
  values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000d',
          '2027-04-05 18:30+00', '2027-04-05 19:30+00', 'confirmed');
  -- Canceled bookings free the slot.
  insert into public.bookings (customer_id, property_id, technician_id, scheduled_start, scheduled_end, status)
  values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000d',
          '2027-04-05 16:30+00', '2027-04-05 17:00+00', 'canceled');
end $$;

\echo 'T11 entitlements: scheduled or completed requires a booking; one booking per entitlement'
do $$ begin
  begin
    insert into public.service_entitlements (customer_id, source, status, valid_from, valid_until)
    values ('00000000-0000-0000-0000-00000000000b', 'plan', 'scheduled', '2027-01-01', '2027-12-31');
    raise exception 'FAIL: scheduled entitlement without booking';
  exception when check_violation then null; end;
  insert into public.service_entitlements (customer_id, source, status, valid_from, valid_until, booking_id)
  values ('00000000-0000-0000-0000-00000000000b', 'plan', 'scheduled', '2027-01-01', '2027-12-31', '20000000-0000-0000-0000-0000000000a1');
  begin
    insert into public.service_entitlements (customer_id, source, status, valid_from, valid_until, booking_id)
    values ('00000000-0000-0000-0000-00000000000b', 'plan', 'scheduled', '2027-01-01', '2027-12-31', '20000000-0000-0000-0000-0000000000a1');
    raise exception 'FAIL: two entitlements used one booking';
  exception when unique_violation then null; end;
end $$;

\echo 'T12 financial changes are written to the audit log'
do $$ begin
  assert (select count(*) from public.audit_log where table_name = 'plan_prices' and action = 'update') >= 1, 'price publish audited';
  assert (select count(*) from public.audit_log where table_name = 'payments') >= 1, 'payment audited';
  assert (select count(*) from public.audit_log where table_name = 'service_entitlements') >= 1, 'entitlement audited';
end $$;

\echo 'T13 customers edit only technician instructions on their own property'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  update public.properties set technician_instructions = 'Gate code in the app; dog is friendly' where id = '10000000-0000-0000-0000-0000000000a1';
  begin
    update public.properties set panel_count = 5 where id = '10000000-0000-0000-0000-0000000000a1';
    raise exception 'FAIL: customer changed panel count';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

\echo 'T14 quotes are linked to an account only with a confirmed, matching email'
insert into public.quote_requests (first_name,last_name,email,phone,address_line1,city,state,postal_code,panel_count,property_type,stories,roof_type,access_type,cleaning_request,preferred_window)
values ('Carol','Nguyen','Carol@Test.local','+17075550199','3 Carol Ct','Vacaville','CA','95687',18,'single_family',1,'unknown','unsure','one_time','flexible'),
       ('Mallory','X','someone-else@test.local','+17075550100','4 Other St','Vacaville','CA','95687',10,'single_family',1,'unknown','unsure','one_time','flexible');
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-00000000000e', 'carol@test.local', null);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
do $$ begin
  assert public.claim_my_quotes() = 0, 'unconfirmed email must not claim quotes';
  assert (select count(*) from public.quote_requests) = 0, 'carol sees nothing before confirming';
end $$;
reset role;
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000000e';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
do $$ begin
  assert public.claim_my_quotes() = 1, 'confirmed email claims exactly its own quote (case-insensitive)';
  assert (select count(*) from public.quote_requests) = 1, 'carol sees her quote';
  assert (select first_name from public.profiles where id = auth.uid()) = 'Carol', 'profile prefilled from quote';
  assert public.claim_my_quotes() = 0, 'claiming is idempotent';
end $$;
reset role;
set role anon;
do $$ begin
  begin perform public.claim_my_quotes(); raise exception 'FAIL: anon called claim_my_quotes';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

\echo 'ALL DATABASE TESTS PASSED'
