insert into public.edusim_action_definitions (
  id, kind, name, short_press_action, long_press_action, duration_seconds,
  description, setting, environments, effects, sort_order, created_at, updated_at
)
select
  'relaxant', kind, 'Relaxant', short_press_action, long_press_action, duration_seconds,
  'Generic non-depolarising neuromuscular blocker. Acts on neuromuscular block rather than directly suppressing central respiratory drive.',
  setting, environments,
  '[{"id":"relaxant-neuromuscular-block","target":"neuromuscular.block","operation":"target","value":1.0,"onsetSeconds":120,"durationSeconds":1200,"recoverySeconds":600}]'::jsonb,
  sort_order, created_at, now()
from public.edusim_action_definitions
where id = 'atracurium'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  effects = excluded.effects,
  setting = excluded.setting,
  environments = excluded.environments,
  sort_order = excluded.sort_order,
  updated_at = now();

delete from public.edusim_action_definitions where id = 'atracurium';

update public.edusim_action_definitions
set
  name = 'Relaxant',
  description = 'Generic non-depolarising neuromuscular blocker. Acts on neuromuscular block rather than directly suppressing central respiratory drive.',
  effects = '[{"id":"relaxant-neuromuscular-block","target":"neuromuscular.block","operation":"target","value":1.0,"onsetSeconds":120,"durationSeconds":1200,"recoverySeconds":600}]'::jsonb,
  updated_at = now()
where id = 'relaxant';
