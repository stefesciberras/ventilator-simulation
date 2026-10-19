-- Generic scenario action events for live teaching sessions.
-- Candidate actions are recorded on their session membership so instructor-side
-- scenario runtimes can use them as progression triggers.

alter table public.session_members
  add column if not exists last_scenario_action text,
  add column if not exists scenario_action_revision bigint not null default 0,
  add column if not exists scenario_action_at timestamptz;

create or replace function public.record_scenario_action(
  p_session_id uuid,
  p_action text
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

  if p_action is null or length(trim(p_action)) = 0 or length(p_action) > 80 then
    raise exception 'Invalid scenario action';
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
  set last_scenario_action = trim(p_action),
      scenario_action_revision = scenario_action_revision + 1,
      scenario_action_at = now(),
      last_seen = now()
  where session_id = p_session_id
    and user_id = auth.uid()
    and role = 'candidate';

  if not found then
    raise exception 'Candidate session membership not found';
  end if;
end;
$$;

grant execute on function public.record_scenario_action(uuid, text) to authenticated;
