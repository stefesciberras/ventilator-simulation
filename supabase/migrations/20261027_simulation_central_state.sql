-- Simulation mode uses one canonical shared product_state. Both instructor and
-- candidate submit revision-checked patches to this row; candidate patches are
-- restricted to the controls that are intentionally bidirectional.

create or replace function private.edusim_jsonb_deep_merge(p_base jsonb, p_patch jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  result jsonb := coalesce(p_base, '{}'::jsonb);
  item record;
begin
  if jsonb_typeof(p_patch) <> 'object' or jsonb_typeof(result) <> 'object' then
    return p_patch;
  end if;

  for item in select key, value from jsonb_each(p_patch)
  loop
    if result ? item.key then
      result := jsonb_set(
        result,
        array[item.key],
        private.edusim_jsonb_deep_merge(result -> item.key, item.value),
        true
      );
    else
      result := result || jsonb_build_object(item.key, item.value);
    end if;
  end loop;
  return result;
end;
$$;

create or replace function private.edusim_candidate_simulation_patch(p_patch jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  result jsonb := '{}'::jsonb;
  patient_patch jsonb := '{}'::jsonb;
  respiratory_source jsonb := coalesce(p_patch #> '{patient,respiratory}', '{}'::jsonb);
  respiratory_patch jsonb := '{}'::jsonb;
  gas_source jsonb := coalesce(p_patch #> '{patient,anaestheticGases}', '{}'::jsonb);
  gas_patch jsonb := '{}'::jsonb;
  key_name text;
  top_key text;
begin
  foreach top_key in array array[
    'lastActionId',
    'actionSequence',
    'actionSimulationTime',
    'actionCommand',
    'actionRuntimeSnapshot'
  ] loop
    if coalesce(p_patch, '{}'::jsonb) ? top_key then
      result := result || jsonb_build_object(top_key, p_patch -> top_key);
    end if;
  end loop;

  foreach key_name in array array[
    'ventilatorMode',
    'ventilatorSetRate',
    'ventilatorSetTidalVolumeMl',
    'ventilatorInspiratoryTimeSeconds',
    'ventilatorInspiratoryFlowLMin',
    'ventilatorPlateauPercent',
    'ventilatorPressureControlCmH2O',
    'ventilatorVolumeGuaranteePressureLimitCmH2O',
    'ventilatorPressureSupportCmH2O',
    'ventilatorTerminationSensitivityPercent',
    'ventilatorSimvSyncWindowPercent',
    'peepCmH2O',
    'fio2'
  ] loop
    if respiratory_source ? key_name then
      respiratory_patch := respiratory_patch || jsonb_build_object(key_name, respiratory_source -> key_name);
    end if;
  end loop;

  if respiratory_patch <> '{}'::jsonb then
    patient_patch := patient_patch || jsonb_build_object('respiratory', respiratory_patch);
  end if;

  if gas_source ? 'fiSevoPercent' then
    gas_patch := jsonb_build_object('fiSevoPercent', gas_source -> 'fiSevoPercent');
    patient_patch := patient_patch || jsonb_build_object('anaestheticGases', gas_patch);
  end if;

  if patient_patch <> '{}'::jsonb then
    result := result || jsonb_build_object('patient', patient_patch);
  end if;

  return result;
end;
$$;

create or replace function public.apply_edusim_simulation_patch(
  p_session_id uuid,
  p_expected_revision bigint,
  p_patch jsonb,
  p_mutation_id uuid default null
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

  if current_session.instructor_id = auth.uid() then
    resolved_role := 'instructor';
  elsif exists (
    select 1
    from public.session_members sm
    where sm.session_id = p_session_id
      and sm.user_id = auth.uid()
      and sm.role = 'candidate'
  ) then
    resolved_role := 'candidate';
    effective_patch := private.edusim_candidate_simulation_patch(effective_patch);
  else
    raise exception 'Simulation session membership not found';
  end if;

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

revoke all on function public.apply_edusim_simulation_patch(uuid, bigint, jsonb, uuid) from public;
revoke all on function public.apply_edusim_simulation_patch(uuid, bigint, jsonb, uuid) from anon;
grant execute on function public.apply_edusim_simulation_patch(uuid, bigint, jsonb, uuid) to authenticated;

-- The canonical Simulation row may now be written by either logical role. Log
-- product-state changes using the authenticated member role rather than assuming
-- every teaching_sessions update came from the instructor.
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

  select sm.role into origin_role
  from public.session_members sm
  where sm.session_id = new.id
    and sm.user_id = auth.uid()
  order by case sm.role when 'instructor' then 0 else 1 end
  limit 1;

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
