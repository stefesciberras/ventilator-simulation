create table if not exists private.edusim_simulation_sync_debug (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  occurred_at timestamptz not null default now(),
  txid bigint not null default txid_current(),
  source_table text not null,
  event_type text not null,
  auth_user_id uuid,
  actor_role text,
  member_id uuid,
  session_revision_before bigint,
  session_revision_after bigint,
  state_changed boolean not null default false,
  runtime_mode_before text,
  runtime_mode_after text,
  state_signature_before text,
  state_signature_after text,
  respiratory_before jsonb,
  respiratory_after jsonb,
  anaesthetic_gases_before jsonb,
  anaesthetic_gases_after jsonb,
  action_command_before jsonb,
  action_command_after jsonb,
  state_before jsonb,
  state_after jsonb
);

create index if not exists edusim_sim_sync_debug_session_time_idx
  on private.edusim_simulation_sync_debug(session_id, occurred_at, id);

create or replace function private.trace_simulation_session_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  before_mode text := old.product_state ->> 'runtimeMode';
  after_mode text := new.product_state ->> 'runtimeMode';
  logical_role text;
begin
  if coalesce(before_mode, after_mode) <> 'simulation' then
    return new;
  end if;

  logical_role := case
    when auth.uid() = new.instructor_id then 'instructor'
    when exists (
      select 1 from public.session_members m
      where m.session_id = new.id and m.user_id = auth.uid() and m.role = 'candidate'
    ) then 'candidate'
    else 'unknown'
  end;

  insert into private.edusim_simulation_sync_debug (
    session_id, source_table, event_type, auth_user_id, actor_role,
    session_revision_before, session_revision_after, state_changed,
    runtime_mode_before, runtime_mode_after,
    state_signature_before, state_signature_after,
    respiratory_before, respiratory_after,
    anaesthetic_gases_before, anaesthetic_gases_after,
    action_command_before, action_command_after,
    state_before, state_after
  ) values (
    new.id, 'teaching_sessions', 'session.update', auth.uid(), logical_role,
    old.product_state_revision, new.product_state_revision,
    old.product_state is distinct from new.product_state,
    before_mode, after_mode,
    md5(coalesce(old.product_state, '{}'::jsonb)::text),
    md5(coalesce(new.product_state, '{}'::jsonb)::text),
    old.product_state #> '{patient,respiratory}',
    new.product_state #> '{patient,respiratory}',
    old.product_state #> '{patient,anaestheticGases}',
    new.product_state #> '{patient,anaestheticGases}',
    old.product_state -> 'actionCommand',
    new.product_state -> 'actionCommand',
    old.product_state, new.product_state
  );
  return new;
end;
$$;

create or replace function private.trace_simulation_member_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  session_mode text;
  session_revision bigint;
begin
  select s.product_state ->> 'runtimeMode', s.product_state_revision
    into session_mode, session_revision
  from public.teaching_sessions s
  where s.id = new.session_id;

  if session_mode <> 'simulation' then
    return new;
  end if;

  insert into private.edusim_simulation_sync_debug (
    session_id, source_table, event_type, auth_user_id, actor_role, member_id,
    session_revision_before, session_revision_after, state_changed,
    runtime_mode_before, runtime_mode_after,
    state_signature_before, state_signature_after,
    respiratory_before, respiratory_after,
    anaesthetic_gases_before, anaesthetic_gases_after,
    action_command_before, action_command_after,
    state_before, state_after
  ) values (
    new.session_id, 'session_members',
    case when old.product_state is distinct from new.product_state then 'member.state.update' else 'member.heartbeat' end,
    auth.uid(), new.role, new.id,
    session_revision, session_revision,
    old.product_state is distinct from new.product_state,
    old.product_state ->> 'runtimeMode', new.product_state ->> 'runtimeMode',
    md5(coalesce(old.product_state, '{}'::jsonb)::text),
    md5(coalesce(new.product_state, '{}'::jsonb)::text),
    old.product_state #> '{patient,respiratory}',
    new.product_state #> '{patient,respiratory}',
    old.product_state #> '{patient,anaestheticGases}',
    new.product_state #> '{patient,anaestheticGases}',
    old.product_state -> 'actionCommand',
    new.product_state -> 'actionCommand',
    old.product_state, new.product_state
  );
  return new;
end;
$$;

revoke all on function private.trace_simulation_session_write() from public, anon, authenticated;
revoke all on function private.trace_simulation_member_write() from public, anon, authenticated;

drop trigger if exists trace_simulation_session_write on public.teaching_sessions;
create trigger trace_simulation_session_write
after update on public.teaching_sessions
for each row execute function private.trace_simulation_session_write();

drop trigger if exists trace_simulation_member_write on public.session_members;
create trigger trace_simulation_member_write
after update on public.session_members
for each row execute function private.trace_simulation_member_write();
