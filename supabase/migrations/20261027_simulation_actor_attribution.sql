-- Fix Simulation actor attribution when instructor and candidate authenticate with
-- the same Supabase user identity on different devices. The client must declare
-- its logical role and the server validates that role against the session.

create or replace function public.apply_edusim_simulation_patch(
  p_session_id uuid,
  p_expected_revision bigint,
  p_patch jsonb,
  p_mutation_id uuid,
  p_actor_role text
)
returns table(
  applied boolean,
  session_row jsonb,
  actor_role text,
  mutation_id uuid
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  current_session public.teaching_sessions%rowtype;
  effective_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  next_state jsonb;
  resolved_role text;
  resolved_mutation_id uuid := coalesce(p_mutation_id, gen_random_uuid());
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_actor_role not in ('instructor', 'candidate') then
    raise exception 'Invalid Simulation actor role';
  end if;

  select * into current_session
  from public.teaching_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Simulation session not found';
  end if;
  if current_session.status = 'ended' or current_session.expires_at <= now() then
    raise exception 'Simulation session expired or ended';
  end if;
  if coalesce(current_session.product_state ->> 'runtimeMode', 'teaching') <> 'simulation' then
    raise exception 'Central mutation is only available in Simulation mode';
  end if;

  if p_actor_role = 'instructor' then
    if current_session.instructor_id <> auth.uid() then
      raise exception 'Instructor authority not found for this Simulation session';
    end if;
    resolved_role := 'instructor';
  else
    if not exists (
      select 1
      from public.session_members sm
      where sm.session_id = p_session_id
        and sm.user_id = auth.uid()
        and sm.role = 'candidate'
    ) then
      raise exception 'Candidate membership not found for this Simulation session';
    end if;
    resolved_role := 'candidate';
    effective_patch := private.edusim_candidate_simulation_patch(effective_patch);
  end if;

  -- Transaction-local marker consumed by logging/debug triggers. Safe because the
  -- role has been validated above.
  perform set_config('loppjusim.actor_role', resolved_role, true);

  if coalesce(p_expected_revision, 0) <> coalesce(current_session.product_state_revision, 0) then
    return query select false, to_jsonb(current_session), resolved_role, resolved_mutation_id;
    return;
  end if;

  next_state := private.edusim_jsonb_deep_merge(
    coalesce(current_session.product_state, '{}'::jsonb),
    effective_patch
  );
  next_state := jsonb_set(next_state, '{runtimeMode}', '"simulation"'::jsonb, true);

  if next_state is not distinct from current_session.product_state then
    return query select true, to_jsonb(current_session), resolved_role, resolved_mutation_id;
    return;
  end if;

  update public.teaching_sessions
  set product_state = next_state,
      product_state_revision = coalesce(product_state_revision, 0) + 1,
      updated_at = now()
  where id = p_session_id
  returning * into current_session;

  return query select true, to_jsonb(current_session), resolved_role, resolved_mutation_id;
end;
$$;

revoke all on function public.apply_edusim_simulation_patch(uuid, bigint, jsonb, uuid, text) from public;
revoke all on function public.apply_edusim_simulation_patch(uuid, bigint, jsonb, uuid, text) from anon;
grant execute on function public.apply_edusim_simulation_patch(uuid, bigint, jsonb, uuid, text) to authenticated;

-- Canonical Simulation writes are attributed using the validated transaction-local
-- role rather than guessing from auth.uid(), which is ambiguous when one identity
-- has both instructor and candidate membership in the same session.
create or replace function private.log_teaching_session_changes()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  control_before jsonb;
  control_after jsonb;
  origin_role text;
begin
  if auth.uid() is null then
    return new;
  end if;

  origin_role := nullif(current_setting('loppjusim.actor_role', true), '');

  if origin_role not in ('instructor', 'candidate') then
    select sm.role into origin_role
    from public.session_members sm
    where sm.session_id = new.id
      and sm.user_id = auth.uid()
    order by case sm.role when 'instructor' then 0 else 1 end
    limit 1;
  end if;

  if origin_role is null and auth.uid() = new.instructor_id then
    origin_role := 'instructor';
  end if;
  if origin_role is null then
    return new;
  end if;

  if origin_role = 'instructor' then
    if old.ventilator_settings is distinct from new.ventilator_settings then
      insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
      values (new.id, 'settings', 'instructor.ventilator.changed', 'Ventilator settings changed',
        jsonb_build_object('before', old.ventilator_settings, 'after', new.ventilator_settings, '_originRole', origin_role));
    end if;

    if old.patient_settings is distinct from new.patient_settings then
      insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
      values (new.id, 'settings', 'instructor.patient.changed', 'Patient settings changed',
        jsonb_build_object('before', old.patient_settings, 'after', new.patient_settings, '_originRole', origin_role));
    end if;

    if old.alarm_settings is distinct from new.alarm_settings then
      insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
      values (new.id, 'settings', 'instructor.alarm_limits.changed', 'Alarm limits changed',
        jsonb_build_object('before', old.alarm_settings, 'after', new.alarm_settings, '_originRole', origin_role));
    end if;
  end if;

  if old.product_state is distinct from new.product_state then
    insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
    values (
      new.id,
      'settings',
      origin_role || '.product_state.changed',
      'Simulator settings changed',
      jsonb_build_object('before', old.product_state, 'after', new.product_state, '_originRole', origin_role)
    );
  end if;

  if origin_role = 'instructor' and old.simulation_paused is distinct from new.simulation_paused then
    insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
    values (new.id, 'device', case when new.simulation_paused then 'simulation.paused' else 'simulation.resumed' end,
      case when new.simulation_paused then 'Simulation paused' else 'Simulation resumed' end,
      jsonb_build_object('_originRole', origin_role));
  end if;

  if origin_role = 'instructor' then
    control_before := jsonb_build_object(
      'syncPatient', old.sync_patient,
      'syncVentilator', old.sync_ventilator,
      'candidateCanEditPatient', old.candidate_can_edit_patient,
      'candidateCanEditVentilator', old.candidate_can_edit_ventilator,
      'candidateControlsVisible', old.candidate_controls_visible,
      'syncAlarms', old.sync_alarms,
      'candidateCanEditAlarms', old.candidate_can_edit_alarms,
      'alarmsSilent', old.alarms_silent,
      'candidateCanEditWaveforms', old.candidate_can_edit_waveforms,
      'allowOesophagealPressure', old.allow_oesophageal_pressure,
      'showPatientEffort', old.show_patient_effort
    );
    control_after := jsonb_build_object(
      'syncPatient', new.sync_patient,
      'syncVentilator', new.sync_ventilator,
      'candidateCanEditPatient', new.candidate_can_edit_patient,
      'candidateCanEditVentilator', new.candidate_can_edit_ventilator,
      'candidateControlsVisible', new.candidate_controls_visible,
      'syncAlarms', new.sync_alarms,
      'candidateCanEditAlarms', new.candidate_can_edit_alarms,
      'alarmsSilent', new.alarms_silent,
      'candidateCanEditWaveforms', new.candidate_can_edit_waveforms,
      'allowOesophagealPressure', new.allow_oesophageal_pressure,
      'showPatientEffort', new.show_patient_effort
    );
    if control_before is distinct from control_after then
      insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
      values (new.id, 'session', 'session.controls.changed', 'Session controls changed',
        jsonb_build_object('before', control_before, 'after', control_after, '_originRole', origin_role));
    end if;

    if old.status is distinct from new.status and new.status = 'ended' then
      insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
      values (new.id, 'session', 'session.ended', 'Session ended', jsonb_build_object('_originRole', origin_role));
    end if;
  end if;

  return new;
end;
$$;

-- Candidate member product_state is legacy telemetry. It is not an authoritative
-- source in Simulation mode and must not create human-readable setting logs.
create or replace function private.log_candidate_session_changes()
returns trigger
language plpgsql
set search_path to public, private, pg_temp
as $$
declare
  canonical_patient jsonb;
  canonical_ventilator jsonb;
  canonical_product_state jsonb;
  canonical_runtime_mode text;
  action_label text;
begin
  if auth.uid() is null or new.role <> 'candidate' or new.user_id <> auth.uid() then
    return new;
  end if;

  select s.patient_settings, s.ventilator_settings, s.product_state, s.product_state ->> 'runtimeMode'
    into canonical_patient, canonical_ventilator, canonical_product_state, canonical_runtime_mode
  from public.teaching_sessions s
  where s.id = new.session_id;

  if canonical_runtime_mode = 'simulation' then
    return new;
  end if;

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

-- Make the private debug trace report the validated logical role too.
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

  logical_role := nullif(current_setting('loppjusim.actor_role', true), '');
  if logical_role not in ('instructor', 'candidate') then
    logical_role := case
      when auth.uid() = new.instructor_id then 'instructor'
      when exists (
        select 1 from public.session_members m
        where m.session_id = new.id and m.user_id = auth.uid() and m.role = 'candidate'
      ) then 'candidate'
      else 'unknown'
    end;
  end if;

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
