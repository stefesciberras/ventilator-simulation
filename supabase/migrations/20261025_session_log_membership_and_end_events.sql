create or replace function private.prepare_edusim_session_log_entry()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  member_role text;
  member_name text;
  session_product text;
  session_status text;
  session_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select s.product_id, s.status, s.expires_at
    into session_product, session_status, session_expires_at
  from public.teaching_sessions s
  where s.id = new.session_id;

  if session_product is null then
    raise exception 'Teaching session not found';
  end if;
  if (session_status = 'ended' and new.event_type <> 'session.ended') or session_expires_at <= now() then
    raise exception 'Teaching session expired or ended';
  end if;

  select sm.role, sm.display_name
    into member_role, member_name
  from public.session_members sm
  where sm.session_id = new.session_id
    and sm.user_id = auth.uid()
  order by case sm.role when 'instructor' then 0 else 1 end
  limit 1;

  if member_role is null then
    raise exception 'Teaching session membership not found';
  end if;

  new.product_id := session_product;
  new.actor_user_id := auth.uid();
  new.actor_role := member_role;
  new.actor_name := coalesce(nullif(trim(member_name), ''), case member_role when 'instructor' then 'Instructor' else 'Candidate' end);
  new.created_at := now();
  new.client_occurred_at := coalesce(new.client_occurred_at, now());
  new.details := coalesce(new.details, '{}'::jsonb);
  return new;
end;
$$;

create or replace function private.log_session_member_join()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    return new;
  end if;

  insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
  values (
    new.session_id,
    'session',
    case when new.role = 'instructor' then 'session.started' else 'candidate.joined' end,
    case when new.role = 'instructor' then 'Session started' else 'Candidate joined session' end,
    '{}'::jsonb
  );
  return new;
end;
$$;

drop trigger if exists log_session_member_join on public.session_members;
create trigger log_session_member_join
after insert on public.session_members
for each row execute function private.log_session_member_join();

create or replace function private.log_candidate_session_changes()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  canonical_patient jsonb;
  canonical_ventilator jsonb;
  canonical_product_state jsonb;
  action_label text;
begin
  if auth.uid() is null or new.role <> 'candidate' or new.user_id <> auth.uid() then
    return new;
  end if;

  select s.patient_settings, s.ventilator_settings, s.product_state
    into canonical_patient, canonical_ventilator, canonical_product_state
  from public.teaching_sessions s
  where s.id = new.session_id;

  if old.ventilator_settings is distinct from new.ventilator_settings
     and new.ventilator_settings is distinct from canonical_ventilator then
    insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
    values (new.session_id, 'settings', 'candidate.ventilator.changed', 'Ventilator settings changed',
      jsonb_build_object('before', old.ventilator_settings, 'after', new.ventilator_settings));
  end if;

  if old.patient_settings is distinct from new.patient_settings
     and new.patient_settings is distinct from canonical_patient then
    insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
    values (new.session_id, 'settings', 'candidate.patient.changed', 'Patient settings changed',
      jsonb_build_object('before', old.patient_settings, 'after', new.patient_settings));
  end if;

  if old.product_state is distinct from new.product_state
     and new.product_state is distinct from canonical_product_state then
    insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
    values (new.session_id, 'settings', 'candidate.product_state.changed', 'Simulator settings changed',
      jsonb_build_object('before', old.product_state, 'after', new.product_state));
  end if;

  if old.scenario_action_revision is distinct from new.scenario_action_revision
     and new.last_scenario_action is not null
     and new.last_scenario_action <> 'freeze-waveform' then
    action_label := case new.last_scenario_action
      when 'oxygen-flush' then 'Oxygen flush'
      when 'nebulisation' then 'Nebuliser activated'
      when 'inspiratory-hold' then 'Inspiratory hold'
      when 'expiratory-hold' then 'Expiratory hold'
      else new.last_scenario_action
    end;
    insert into public.edusim_session_log_entries (session_id, category, event_type, label, details, client_occurred_at)
    values (new.session_id, 'device', 'candidate.device_action', action_label,
      jsonb_build_object('action', new.last_scenario_action, 'revision', new.scenario_action_revision),
      coalesce(new.scenario_action_at, now()));
  end if;

  return new;
end;
$$;
