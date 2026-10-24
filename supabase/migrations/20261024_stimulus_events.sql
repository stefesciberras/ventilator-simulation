insert into public.edusim_action_definitions (
  id, kind, name, short_press_action, long_press_action, duration_seconds,
  description, setting, environments, effects, sort_order, created_at, updated_at
)
values
  (
    'laryngoscopy', 'event', 'Laryngoscopy', 'momentary', null, 0,
    'Brief intense sympathetic/nociceptive stimulus, attenuated by current analgesic state.',
    'ana', array['edumon-ana'],
    '[{"id":"laryngoscopy-sympathetic-stimulus","target":"stimulus.sympathetic","operation":"offset","value":1.0,"onsetSeconds":2,"durationSeconds":30,"recoverySeconds":30}]'::jsonb,
    40, now(), now()
  ),
  (
    'pain', 'event', 'Pain', 'momentary', null, 0,
    'Moderate nociceptive stimulus, attenuated by current analgesic state.',
    'ana', array['edumon-ana'],
    '[{"id":"pain-sympathetic-stimulus","target":"stimulus.sympathetic","operation":"offset","value":0.55,"onsetSeconds":3,"durationSeconds":120,"recoverySeconds":60}]'::jsonb,
    50, now(), now()
  ),
  (
    'surgical-stimulus', 'event', 'Surgical stimulus', 'momentary', null, 0,
    'Sustained operative nociceptive stimulus, attenuated by current analgesic state.',
    'ana', array['edumon-ana'],
    '[{"id":"surgical-stimulus-sympathetic","target":"stimulus.sympathetic","operation":"offset","value":0.75,"onsetSeconds":5,"durationSeconds":600,"recoverySeconds":120}]'::jsonb,
    60, now(), now()
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
