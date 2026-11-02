-- Persistent instructor-global session controls.
-- These are distinct from patient/model state and from candidate policy flags.

alter table public.teaching_sessions
  add column if not exists waveforms_frozen boolean not null default false,
  add column if not exists waveforms_freeze_revision bigint not null default 0,
  add column if not exists global_alarms_silenced boolean not null default false,
  add column if not exists global_alarm_silence_revision bigint not null default 0;

comment on column public.teaching_sessions.waveforms_frozen is
  'Instructor-global waveform freeze. Applies to every participant; candidate local freeze may add to but never override it.';
comment on column public.teaching_sessions.global_alarms_silenced is
  'Instructor-global alarm silence state. Distinct from alarms_silent, which is the candidate alarm policy flag.';

create or replace function public.set_edusim_session_controls(
  p_session_id uuid,
  p_waveforms_frozen boolean default null,
  p_global_alarms_silenced boolean default null
)
returns table(
  waveforms_frozen boolean,
  waveforms_freeze_revision bigint,
  global_alarms_silenced boolean,
  global_alarm_silence_revision bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_session public.teaching_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into current_session
  from public.teaching_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Session not found';
  end if;
  if current_session.status = 'ended' or current_session.expires_at <= now() then
    raise exception 'Session expired or ended';
  end if;
  if current_session.instructor_id <> auth.uid() then
    raise exception 'Only the instructor may change global session controls';
  end if;

  update public.teaching_sessions s
  set waveforms_frozen = coalesce(p_waveforms_frozen, s.waveforms_frozen),
      waveforms_freeze_revision = case
        when p_waveforms_frozen is not null and p_waveforms_frozen is distinct from s.waveforms_frozen
          then s.waveforms_freeze_revision + 1
        else s.waveforms_freeze_revision
      end,
      global_alarms_silenced = coalesce(p_global_alarms_silenced, s.global_alarms_silenced),
      global_alarm_silence_revision = case
        when p_global_alarms_silenced is not null and p_global_alarms_silenced is distinct from s.global_alarms_silenced
          then s.global_alarm_silence_revision + 1
        else s.global_alarm_silence_revision
      end,
      updated_at = now(),
      expires_at = greatest(s.expires_at, now() + interval '2 hours')
  where s.id = p_session_id
  returning s.* into current_session;

  return query select
    current_session.waveforms_frozen,
    current_session.waveforms_freeze_revision,
    current_session.global_alarms_silenced,
    current_session.global_alarm_silence_revision;
end;
$$;

revoke all on function public.set_edusim_session_controls(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_edusim_session_controls(uuid, boolean, boolean) to authenticated;
