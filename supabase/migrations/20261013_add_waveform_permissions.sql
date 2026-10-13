alter table public.teaching_sessions
  add column if not exists candidate_can_edit_waveforms boolean not null default true,
  add column if not exists allow_oesophageal_pressure boolean not null default true;

comment on column public.teaching_sessions.candidate_can_edit_waveforms is
  'Whether candidates may alter local waveform trace configuration.';

comment on column public.teaching_sessions.allow_oesophageal_pressure is
  'Whether the oesophageal pressure waveform option is available on candidate displays.';
