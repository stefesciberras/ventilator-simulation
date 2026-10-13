alter table public.teaching_sessions
  add column if not exists sync_alarms boolean not null default false,
  add column if not exists candidate_can_edit_alarms boolean not null default false,
  add column if not exists alarm_settings jsonb not null default '{}'::jsonb,
  add column if not exists alarm_revision bigint not null default 0,
  add column if not exists instructor_client_id uuid,
  add column if not exists instructor_last_seen timestamptz;

alter table public.session_members
  add column if not exists alarm_level text;

alter table public.session_members
  drop constraint if exists session_members_alarm_level_check;

alter table public.session_members
  add constraint session_members_alarm_level_check
  check (alarm_level is null or alarm_level in ('yellow','red'));

create or replace function public.create_teaching_session(
  p_patient_settings jsonb default '{}'::jsonb,
  p_ventilator_settings jsonb default '{}'::jsonb,
  p_alarm_settings jsonb default '{}'::jsonb
)
returns table(session_id uuid, session_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_session public.teaching_sessions%rowtype;
  new_id uuid;
  new_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into existing_session
  from public.teaching_sessions
  where instructor_id = auth.uid()
    and status <> 'ended'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    return query select existing_session.id, existing_session.session_key;
    return;
  end if;

  loop
    new_key := public.generate_session_key();
    exit when not exists (
      select 1 from public.teaching_sessions where teaching_sessions.session_key = new_key
    );
  end loop;

  insert into public.teaching_sessions (
    session_key, instructor_id, patient_settings, ventilator_settings, alarm_settings
  ) values (
    new_key, auth.uid(), p_patient_settings, p_ventilator_settings, p_alarm_settings
  ) returning id into new_id;

  insert into public.session_members (session_id, user_id, role)
  values (new_id, auth.uid(), 'instructor')
  on conflict on constraint session_members_session_user_role_key do nothing;

  return query select new_id, new_key;
end;
$$;

create or replace function public.touch_session_member(
  p_session_id uuid,
  p_patient_settings jsonb default '{}'::jsonb,
  p_ventilator_settings jsonb default '{}'::jsonb,
  p_alarm_level text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_alarm_level is not null and p_alarm_level not in ('yellow','red') then
    raise exception 'Invalid alarm level';
  end if;

  update public.session_members
  set last_seen = now(),
      patient_settings = coalesce(p_patient_settings, '{}'::jsonb),
      ventilator_settings = coalesce(p_ventilator_settings, '{}'::jsonb),
      alarm_level = p_alarm_level,
      state_updated_at = now()
  where session_id = p_session_id
    and user_id = auth.uid()
    and role = 'candidate';

  if not found then
    raise exception 'Candidate session membership not found';
  end if;
end;
$$;

create or replace function public.find_active_instructor_session()
returns table(session_id uuid, session_key text)
language sql
security definer
set search_path = public
as $$
  select s.id, s.session_key
  from public.teaching_sessions s
  where auth.uid() is not null
    and s.instructor_id = auth.uid()
    and s.status <> 'ended'
    and s.expires_at > now()
  order by s.created_at desc
  limit 1;
$$;

create or replace function public.claim_instructor_session(
  p_session_id uuid,
  p_client_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.teaching_sessions
  set instructor_client_id = p_client_id,
      instructor_last_seen = now(),
      updated_at = now()
  where id = p_session_id
    and instructor_id = auth.uid()
    and status <> 'ended'
    and expires_at > now()
    and (
      instructor_client_id is null
      or instructor_client_id = p_client_id
      or instructor_last_seen is null
      or instructor_last_seen < now() - interval '30 seconds'
    );

  if not found then
    raise exception 'This teaching session is already controlled by another instructor client';
  end if;
end;
$$;

create or replace function public.touch_instructor_session(
  p_session_id uuid,
  p_client_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.teaching_sessions
  set instructor_last_seen = now(),
      updated_at = now()
  where id = p_session_id
    and instructor_id = auth.uid()
    and instructor_client_id = p_client_id
    and status <> 'ended';

  if not found then
    raise exception 'Instructor lease is no longer held by this client';
  end if;
end;
$$;

revoke execute on function public.create_teaching_session(jsonb,jsonb,jsonb) from public, anon;
revoke execute on function public.touch_session_member(uuid,jsonb,jsonb,text) from public, anon;
revoke execute on function public.find_active_instructor_session() from public, anon;
revoke execute on function public.claim_instructor_session(uuid,uuid) from public, anon;
revoke execute on function public.touch_instructor_session(uuid,uuid) from public, anon;

grant execute on function public.create_teaching_session(jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.touch_session_member(uuid,jsonb,jsonb,text) to authenticated;
grant execute on function public.find_active_instructor_session() to authenticated;
grant execute on function public.claim_instructor_session(uuid,uuid) to authenticated;
grant execute on function public.touch_instructor_session(uuid,uuid) to authenticated;
