update public.edusim_action_definitions
set
  long_press_action = 'dose-levels',
  description = case id
    when 'remifentanil' then 'Toggle Remifentanil infusion with rapid onset and offset. Long press selects low, medium or high infusion intensity.'
    when 'tiva' then 'Toggle Propofol TCI-style infusion. Long press selects low, medium or high target intensity.'
    else description
  end,
  updated_at = now()
where id in ('remifentanil', 'tiva');

insert into public.edusim_action_definitions (
  id, kind, name, short_press_action, long_press_action, duration_seconds,
  description, setting, environments, effects, sort_order, created_at, updated_at
)
values
  (
    'atropine', 'drug', 'Atropine', 'momentary', null, 0,
    'Cardiovascular rescue bolus with a predominantly chronotropic teaching-model effect.',
    'ana', array['edumon-ana'],
    '[{"id":"atropine-heart-rate","target":"haemodynamics.heartRate","operation":"offset","value":25,"onsetSeconds":20,"durationSeconds":300,"recoverySeconds":300}]'::jsonb,
    110, now(), now()
  ),
  (
    'ephedrine', 'drug', 'Ephedrine', 'momentary', null, 0,
    'Cardiovascular vasopressor bolus with mixed heart-rate and arterial-pressure effects.',
    'ana', array['edumon-ana'],
    '[
      {"id":"ephedrine-heart-rate","target":"haemodynamics.heartRate","operation":"offset","value":12,"onsetSeconds":15,"durationSeconds":240,"recoverySeconds":240},
      {"id":"ephedrine-map","target":"haemodynamics.meanArterialPressure","operation":"offset","value":15,"onsetSeconds":15,"durationSeconds":240,"recoverySeconds":240}
    ]'::jsonb,
    120, now(), now()
  ),
  (
    'phenylephrine', 'drug', 'Phenylephrine', 'momentary', null, 0,
    'Cardiovascular vasopressor bolus: raises arterial pressure with a modest reflex heart-rate reduction.',
    'ana', array['edumon-ana'],
    '[
      {"id":"phenylephrine-map","target":"haemodynamics.meanArterialPressure","operation":"offset","value":25,"onsetSeconds":15,"durationSeconds":180,"recoverySeconds":180},
      {"id":"phenylephrine-heart-rate","target":"haemodynamics.heartRate","operation":"offset","value":-8,"onsetSeconds":20,"durationSeconds":180,"recoverySeconds":180}
    ]'::jsonb,
    130, now(), now()
  ),
  (
    'noradrenaline', 'drug', 'Noradrenaline infusion', 'toggle', 'dose-levels', 0,
    'Toggle noradrenaline vasopressor infusion. Long press selects low, medium or high infusion intensity.',
    'ana', array['edumon-ana'],
    '[
      {"id":"noradrenaline-map","target":"haemodynamics.meanArterialPressure","operation":"offset","value":20,"onsetSeconds":30,"durationSeconds":0,"recoverySeconds":60},
      {"id":"noradrenaline-heart-rate","target":"haemodynamics.heartRate","operation":"offset","value":-3,"onsetSeconds":30,"durationSeconds":0,"recoverySeconds":60}
    ]'::jsonb,
    140, now(), now()
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
