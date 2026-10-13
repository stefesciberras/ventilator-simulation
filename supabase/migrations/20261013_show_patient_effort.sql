alter table public.teaching_sessions
  add column if not exists show_patient_effort boolean not null default false;
