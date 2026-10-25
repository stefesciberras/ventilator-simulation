create or replace function private.log_teaching_session_changes()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  control_before jsonb;
  control_after jsonb;
begin
  if auth.uid() is null or auth.uid() <> new.instructor_id then
    return new;
  end if;

  if old.ventilator_settings is distinct from new.ventilator_settings then
    insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
    values (new.id, 'settings', 'instructor.ventilator.changed', 'Ventilator settings changed',
      jsonb_build_object('before', old.ventilator_settings, 'after', new.ventilator_settings));
  end if;

  if old.patient_settings is distinct from new.patient_settings then
    insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
    values (new.id, 'settings', 'instructor.patient.changed', 'Patient settings changed',
      jsonb_build_object('before', old.patient_settings, 'after', new.patient_settings));
  end if;

  if old.alarm_settings is distinct from new.alarm_settings then
    insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
    values (new.id, 'settings', 'instructor.alarm_limits.changed', 'Alarm limits changed',
      jsonb_build_object('before', old.alarm_settings, 'after', new.alarm_settings));
  end if;

  if old.product_state is distinct from new.product_state then
    insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
    values (new.id, 'settings', 'instructor.product_state.changed', 'Simulator settings changed',
      jsonb_build_object('before', old.product_state, 'after', new.product_state));
  end if;

  if old.simulation_paused is distinct from new.simulation_paused then
    insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
    values (new.id, 'device', case when new.simulation_paused then 'simulation.paused' else 'simulation.resumed' end,
      case when new.simulation_paused then 'Simulation paused' else 'Simulation resumed' end,
      '{}'::jsonb);
  end if;

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
      jsonb_build_object('before', control_before, 'after', control_after));
  end if;

  if old.status is distinct from new.status and new.status = 'ended' then
    insert into public.edusim_session_log_entries (session_id, category, event_type, label, details)
    values (new.id, 'session', 'session.ended', 'Session ended', '{}'::jsonb);
  end if;

  return new;
end;
$$;

drop trigger if exists log_teaching_session_changes on public.teaching_sessions;
create trigger log_teaching_session_changes
after update on public.teaching_sessions
for each row execute function private.log_teaching_session_changes();

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
     and new.last_scenario_action is not null then
    action_label := case new.last_scenario_action
      when 'oxygen-flush' then 'Oxygen flush'
      when 'nebulisation' then 'Nebuliser activated'
      when 'inspiratory-hold' then 'Inspiratory hold'
      when 'expiratory-hold' then 'Expiratory hold'
      when 'freeze-waveform' then 'Waveform display frozen'
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

drop trigger if exists log_candidate_session_changes on public.session_members;
create trigger log_candidate_session_changes
after update on public.session_members
for each row execute function private.log_candidate_session_changes();
