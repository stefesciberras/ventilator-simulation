alter table public.teaching_sessions
  alter column sync_patient set default true,
  alter column sync_ventilator set default true,
  alter column sync_alarms set default true,
  alter column alarms_silent set default true,
  alter column candidate_can_edit_patient set default false,
  alter column candidate_can_edit_ventilator set default false,
  alter column candidate_can_edit_alarms set default false;

-- Existing sessions are intentionally left unchanged. These are creation defaults
-- for new teaching rooms only, so an instructor's active room is not altered by
-- deploying this migration.