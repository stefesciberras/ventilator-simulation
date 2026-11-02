-- Live loppjuSIM sessions use expires_at as an inactivity/recovery deadline,
-- not as a fixed lifetime measured from session creation. While either the
-- instructor or a candidate remains connected, heartbeats slide the deadline
-- forward. Explicit status='ended' remains the normal authoritative termination.

-- Existing non-ended rooms get a fresh recovery window when this migration is
-- deployed, including rooms that would otherwise be at the old fixed deadline.
update public.teaching_sessions
set expires_at = greatest(expires_at, now() + interval '2 hours')
where status <> 'ended';

-- The old trigger rewrote expires_at to created_at + 2 hours on every UPDATE,
-- which made a sliding recovery window impossible. Preserve immutable created_at
-- but allow explicit extensions of expires_at.
create or replace function private.enforce_teaching_session_lifetime()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if new.expires_at is null then
      new.expires_at := now() + interval '2 hours';
    end if;
  else
    new.created_at := old.created_at;
    if new.expires_at is null then
      new.expires_at := old.expires_at;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_teaching_session_lifetime() from public, anon, authenticated;

-- Instructor presence keeps the room recoverable. A lease identifies the active
-- instructor controller; losing that lease does not end the session.
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
      expires_at = greatest(expires_at, now() + interval '2 hours'),
      updated_at = now()
  where id = p_session_id
    and instructor_id = auth.uid()
    and instructor_client_id = p_client_id
    and status <> 'ended'
    and expires_at > now();

  if not found then
    raise exception 'Instructor lease is no longer held or the session recovery window has elapsed';
  end if;
end;
$$;

-- Product-neutral candidate telemetry heartbeat. Keeping this participant alive
-- also keeps the parent room recoverable if the instructor refreshes or drops out.
create or replace function public.touch_edusim_session_member(
  p_session_id uuid,
  p_product_state jsonb default '{}'::jsonb
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

  if not exists (
    select 1
    from public.teaching_sessions s
    where s.id = p_session_id
      and s.status <> 'ended'
      and s.expires_at > now()
  ) then
    raise exception 'Session ended or its recovery window elapsed';
  end if;

  update public.session_members
  set last_seen = now(),
      product_state = coalesce(p_product_state, '{}'::jsonb),
      state_updated_at = now()
  where session_id = p_session_id
    and user_id = auth.uid()
    and role = 'candidate';

  if not found then
    raise exception 'Candidate session membership not found';
  end if;

  update public.teaching_sessions
  set expires_at = greatest(expires_at, now() + interval '2 hours'),
      updated_at = now()
  where id = p_session_id
    and status <> 'ended';
end;
$$;

-- Legacy EDUVENT candidate heartbeat retained for compatibility with the older
-- session adapter until all products use the shared product-session path.
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

  if not exists (
    select 1
    from public.teaching_sessions s
    where s.id = p_session_id
      and s.status <> 'ended'
      and s.expires_at > now()
  ) then
    raise exception 'Session ended or its recovery window elapsed';
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

  update public.teaching_sessions
  set expires_at = greatest(expires_at, now() + interval '2 hours'),
      updated_at = now()
  where id = p_session_id
    and status <> 'ended';
end;
$$;

revoke execute on function public.touch_instructor_session(uuid,uuid) from public, anon;
revoke execute on function public.touch_edusim_session_member(uuid,jsonb) from public, anon;
revoke execute on function public.touch_session_member(uuid,jsonb,jsonb,text) from public, anon;

grant execute on function public.touch_instructor_session(uuid,uuid) to authenticated;
grant execute on function public.touch_edusim_session_member(uuid,jsonb) to authenticated;
grant execute on function public.touch_session_member(uuid,jsonb,jsonb,text) to authenticated;
