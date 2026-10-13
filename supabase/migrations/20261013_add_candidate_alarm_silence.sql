alter table public.teaching_sessions
  add column if not exists alarms_silent boolean not null default false;

comment on column public.teaching_sessions.alarms_silent is
  'When alarm sharing is enabled, suppresses alarm audio on candidate displays while preserving visual alarms.';
