-- EDUVENT v0.46 instructor dashboard candidate presence/state telemetry.

alter table public.session_members
  add column if not exists patient_settings jsonb not null default '{}'::jsonb,
  add column if not exists ventilator_settings jsonb not null default '{}'::jsonb,
  add column if not exists state_updated_at timestamptz;

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
    and user_id = auth.uid();

  if not found then
    raise exception 'Session membership not found';
  end if;
end;
$$;

revoke all on function public.touch_session_member(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.touch_session_member(uuid, jsonb, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'session_members'
  ) then
    alter publication supabase_realtime add table public.session_members;
  end if;
end $$;
