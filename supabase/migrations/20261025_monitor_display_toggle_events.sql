insert into public.edusim_action_definitions (
  id, kind, name, short_press_action, long_press_action, duration_seconds,
  description, setting, environments, effects, priority, sort_order
) values
  (
    'monitor-inv-bp', 'event', 'Inv BP', 'toggle', null, 0,
    'Display-only toggle for invasive arterial blood pressure waveform and values. Does not alter physiology.',
    'all', array['edumon-ana','edumon-icu']::text[], '[]'::jsonb, 30, 310
  ),
  (
    'monitor-bis', 'event', 'BIS', 'toggle', null, 0,
    'Display-only toggle for BIS monitoring. Does not alter anaesthetic modelling.',
    'ana', array['edumon-ana']::text[], '[]'::jsonb, 30, 320
  ),
  (
    'monitor-temp', 'event', 'Temp', 'toggle', null, 0,
    'Display-only toggle for temperature monitoring. Does not alter patient temperature modelling.',
    'all', array['edumon-ana','edumon-icu']::text[], '[]'::jsonb, 30, 330
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
