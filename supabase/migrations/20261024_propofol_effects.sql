insert into public.edusim_action_definitions (
  id, kind, name, short_press_action, long_press_action, duration_seconds,
  description, setting, environments, effects, sort_order, created_at, updated_at
)
values (
  'propofol', 'drug', 'Propofol', 'momentary', null, 0,
  'Generic Propofol bolus: increases hypnotic effect, depresses spontaneous respiratory drive and lowers mean arterial pressure.',
  'ana', array['edumon-ana'],
  '[{"id":"propofol-hypnotic-effect","target":"anaesthesia.hypnoticEffect","operation":"offset","value":0.65,"onsetSeconds":25,"durationSeconds":180,"recoverySeconds":240},{"id":"propofol-respiratory-drive","target":"respiration.drive","operation":"multiplier","value":0.4,"onsetSeconds":20,"durationSeconds":150,"recoverySeconds":180},{"id":"propofol-map","target":"haemodynamics.meanArterialPressure","operation":"offset","value":-15,"onsetSeconds":20,"durationSeconds":180,"recoverySeconds":180}]'::jsonb,
  10, now(), now()
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
  sort_order = excluded.sort_order,
  updated_at = now();
