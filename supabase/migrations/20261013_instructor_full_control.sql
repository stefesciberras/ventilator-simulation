alter table public.teaching_sessions
  add column if not exists simulation_paused boolean not null default false,
  add column if not exists pause_revision bigint not null default 0;

alter table public.session_members
  drop constraint if exists session_members_session_id_user_id_key;

alter table public.session_members
  add constraint session_members_session_user_role_key unique (session_id, user_id, role);

create or replace function public.join_teaching_session(
  p_session_key text,
  p_display_name text default null
)
returns table(session_id uuid, session_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_session public.teaching_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into found_session
  from public.teaching_sessions
  where teaching_sessions.session_key = upper(trim(p_session_key))
    and teaching_sessions.status <> 'ended'
    and teaching_sessions.expires_at > now();

  if not found then
    raise exception 'Session not found or expired';
  end if;

  insert into public.session_members (
    session_id, user_id, role, display_name, last_seen
  )
  values (
    found_session.id, auth.uid(), 'candidate', p_display_name, now()
  )
  on conflict on constraint session_members_session_user_role_key
  do update set
    display_name = excluded.display_name,
    last_seen = now();

  return query select found_session.id, found_session.status;
end;
$$;

create or replace function public.touch_session_member(
  p_session_id uuid,
  p_patient_settings jsonb default '{}'::jsonb,
  p_ventilator_settings jsonb default '{}'::jsonb
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

  update public.session_members
  set last_seen = now(),
      patient_settings = coalesce(p_patient_settings, '{}'::jsonb),
      ventilator_settings = coalesce(p_ventilator_settings, '{}'::jsonb),
      state_updated_at = now()
  where session_id = p_session_id
    and user_id = auth.uid()
    and role = 'candidate';

  if not found then
    raise exception 'Candidate session membership not found';
  end if;
end;
$$;
