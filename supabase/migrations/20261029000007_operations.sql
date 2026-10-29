-- =============================================================================
-- Phase 5: owner dashboard and technician app
-- =============================================================================

-- Owner's cost assumptions for profitability estimates (never public).
alter table public.business_settings add column if not exists economics jsonb not null default '{}';
-- Google Business Profile, Yelp, social links (public; used for search "sameAs").
alter table public.business_settings add column if not exists profile_links jsonb not null default '[]';
grant select (profile_links) on public.business_settings to anon, authenticated;

-- Technician safety checklist must be completed before a job starts.
alter table public.job_reports add column if not exists checklist_completed_at timestamptz;

-- Job photos: who took them and a caption.
alter table public.job_photos add column if not exists caption text;
create index if not exists job_photos_booking_idx on public.job_photos (booking_id);

-- ---------- Technician job actions (server code only) ----------
-- Every function checks the job is assigned to the calling technician.

create or replace function public.tech_start_job(p_tech uuid, p_booking uuid, p_checklist jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.technician_id is distinct from p_tech or b.status not in ('confirmed', 'requested', 'rescheduled', 'in_progress') then
    raise exception 'JOB_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  insert into public.job_reports (booking_id, technician_id, safety_checklist, checklist_completed_at, started_at)
  values (p_booking, p_tech, p_checklist, now(), now())
  on conflict (booking_id) do update
    set safety_checklist = excluded.safety_checklist,
        checklist_completed_at = coalesce(public.job_reports.checklist_completed_at, now()),
        started_at = coalesce(public.job_reports.started_at, now());
  update public.bookings set status = 'in_progress' where id = p_booking;
end $$;

create or replace function public.tech_complete_job(p_tech uuid, p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.technician_id is distinct from p_tech or b.status <> 'in_progress' then
    raise exception 'JOB_NOT_IN_PROGRESS' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.job_photos where booking_id = p_booking and kind = 'before')
     or not exists (select 1 from public.job_photos where booking_id = p_booking and kind = 'after') then
    raise exception 'PHOTOS_REQUIRED' using errcode = 'P0001';
  end if;
  update public.job_reports set completed_at = now() where booking_id = p_booking;
  perform public.complete_booking(p_booking);
end $$;

revoke all on function public.tech_start_job(uuid, uuid, jsonb), public.tech_complete_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tech_start_job(uuid, uuid, jsonb), public.tech_complete_job(uuid, uuid) to service_role;

-- complete_booking is also callable for in-progress jobs (already allowed), and
-- technicians may only be assigned to active technician records.
create or replace function public.guard_booking_technician() returns trigger language plpgsql as $$
begin
  if new.technician_id is not null and not exists (select 1 from public.technicians where id = new.technician_id and is_active) then
    raise exception 'Technician is not active.';
  end if;
  return new;
end $$;
drop trigger if exists bookings_technician_guard on public.bookings;
create trigger bookings_technician_guard before insert or update of technician_id on public.bookings
for each row execute function public.guard_booking_technician();
