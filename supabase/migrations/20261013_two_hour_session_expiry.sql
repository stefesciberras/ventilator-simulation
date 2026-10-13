alter table public.teaching_sessions
  alter column expires_at set default (now() + interval '2 hours');

-- Existing sessions use the same lifetime rule, measured from the database
-- creation timestamp rather than either browser's local clock or timezone.
update public.teaching_sessions
set expires_at = created_at + interval '2 hours'
where expires_at is distinct from created_at + interval '2 hours';

create or replace function private.enforce_teaching_session_lifetime()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;

  new.expires_at := new.created_at + interval '2 hours';
  return new;
end;
$$;

revoke all on function private.enforce_teaching_session_lifetime() from public, anon, authenticated;

drop trigger if exists enforce_teaching_session_lifetime on public.teaching_sessions;
create trigger enforce_teaching_session_lifetime
before insert or update on public.teaching_sessions
for each row execute function private.enforce_teaching_session_lifetime();

-- An instructor may only mutate a room while its authoritative lifetime is active.
drop policy if exists "Instructor can update own session" on public.teaching_sessions;
create policy "Instructor can update own session"
on public.teaching_sessions
for update
to authenticated
using (
  instructor_id = (select auth.uid())
  and expires_at > now()
)
with check (
  instructor_id = (select auth.uid())
  and expires_at > now()
);

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
    raise exception 'Teaching session expired or ended';
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
    and status <> 'ended'
    and expires_at > now();

  if not found then
    raise exception 'Instructor lease is no longer held or the teaching session has expired';
  end if;
end;
$$;

revoke execute on function public.touch_session_member(uuid,jsonb,jsonb,text) from public, anon;
revoke execute on function public.touch_instructor_session(uuid,uuid) from public, anon;
grant execute on function public.touch_session_member(uuid,jsonb,jsonb,text) to authenticated;
grant execute on function public.touch_instructor_session(uuid,uuid) to authenticated;