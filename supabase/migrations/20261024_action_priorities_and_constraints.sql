alter table public.edusim_action_definitions
  add column if not exists priority integer not null default 30;

comment on column public.edusim_action_definitions.priority is
  'Default action-effect resolution priority. Higher values resolve later; per-effect JSON priority may override this value.';

insert into public.edusim_action_definitions (
  id, kind, name, short_press_action, long_press_action, duration_seconds,
  description, environments, sort_order, setting, effects, priority, updated_at
)
values (
  'beta-blocker',
  'event',
  'Beta blocker',
  'toggle',
  null,
  0,
  'Simulate clinically significant beta blockade: suppresses positive chronotropic responses from lower-priority effects while leaving other targets intact.',
  array['edumon-ana','edumon-icu']::text[],
  170,
  'all',
  '[{"id":"beta-blocker-positive-chronotropy","target":"haemodynamics.heartRate","operation":"constraint","constraint":"block-increase","value":0,"onsetSeconds":10,"durationSeconds":0,"recoverySeconds":30}]'::jsonb,
  70,
  now()
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  short_press_action = excluded.short_press_action,
  long_press_action = excluded.long_press_action,
  duration_seconds = excluded.duration_seconds,
  description = excluded.description,
  environments = excluded.environments,
  sort_order = excluded.sort_order,
  setting = excluded.setting,
  effects = excluded.effects,
  priority = excluded.priority,
  updated_at = now();
