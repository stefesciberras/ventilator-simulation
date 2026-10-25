insert into public.edusim_action_definitions (
  id, kind, name, short_press_action, long_press_action, duration_seconds,
  description, setting, environments, effects, priority, sort_order, updated_at
) values (
  'antibiotics',
  'drug',
  'Antibiotics',
  'momentary',
  null,
  0,
  'Scenario/logging action only. Produces no physiological effect.',
  'all',
  array['edumon-ana','edumon-icu'],
  '[]'::jsonb,
  30,
  310,
  now()
)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  short_press_action = excluded.short_press_action,
  long_press_action = excluded.long_press_action,
  duration_seconds = excluded.duration_seconds,
  description = excluded.description,
  setting = excluded.setting,
  environments = excluded.environments,
  effects = excluded.effects,
  priority = excluded.priority,
  sort_order = excluded.sort_order,
  updated_at = now();
