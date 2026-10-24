insert into public.edusim_action_definitions (
  id, kind, name, short_press_action, long_press_action, duration_seconds,
  description, setting, environments, effects, sort_order, created_at, updated_at
)
values
  (
    'adrenaline', 'drug', 'Adrenaline infusion', 'toggle', 'dose-levels', 0,
    'Toggle adrenaline inotrope/vasopressor infusion. Long press selects low, medium or high infusion intensity.',
    'ana', array['edumon-ana'],
    '[
      {"id":"adrenaline-map","target":"haemodynamics.meanArterialPressure","operation":"offset","value":15,"onsetSeconds":20,"durationSeconds":0,"recoverySeconds":45},
      {"id":"adrenaline-heart-rate","target":"haemodynamics.heartRate","operation":"offset","value":15,"onsetSeconds":20,"durationSeconds":0,"recoverySeconds":45}
    ]'::jsonb,
    150, now(), now()
  ),
  (
    'neostigmine', 'drug', 'Neostigmine', 'momentary', null, 0,
    'Generic neuromuscular-block reversal action with slower, incomplete reversal in the current teaching model.',
    'ana', array['edumon-ana'],
    '[{"id":"neostigmine-neuromuscular-reversal","target":"neuromuscular.block","operation":"target","value":0.2,"onsetSeconds":180,"durationSeconds":7200,"recoverySeconds":0}]'::jsonb,
    45, now(), now()
  ),
  (
    'sugammadex', 'drug', 'Sugammadex', 'momentary', null, 0,
    'Rapid neuromuscular-block reversal action. Current generic block model does not yet distinguish aminosteroid from other relaxants.',
    'ana', array['edumon-ana'],
    '[{"id":"sugammadex-neuromuscular-reversal","target":"neuromuscular.block","operation":"target","value":0,"onsetSeconds":60,"durationSeconds":7200,"recoverySeconds":0}]'::jsonb,
    47, now(), now()
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
