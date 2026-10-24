insert into public.edusim_action_definitions (
  id, kind, name, short_press_action, long_press_action, duration_seconds,
  description, setting, environments, effects, sort_order, created_at, updated_at
)
values
  (
    'remifentanil', 'drug', 'Remifentanil infusion', 'toggle', null, 0,
    'Toggle Remifentanil infusion with rapid onset and offset: attenuates nociceptive response, depresses spontaneous respiratory drive and modestly lowers heart rate.',
    'ana', array['edumon-ana'],
    '[
      {"id":"remifentanil-nociceptive-response","target":"anaesthesia.nociceptiveResponse","operation":"multiplier","value":0.35,"onsetSeconds":45,"durationSeconds":0,"recoverySeconds":90},
      {"id":"remifentanil-respiratory-drive","target":"respiration.drive","operation":"multiplier","value":0.65,"onsetSeconds":45,"durationSeconds":0,"recoverySeconds":90},
      {"id":"remifentanil-heart-rate","target":"haemodynamics.heartRate","operation":"offset","value":-5,"onsetSeconds":45,"durationSeconds":0,"recoverySeconds":90}
    ]'::jsonb,
    30, now(), now()
  ),
  (
    'tiva', 'drug', 'TIVA (Propofol TCI)', 'toggle', null, 0,
    'Toggle Propofol TCI-style infusion. Uses a sustained hypnotic-effect surrogate rather than modelling a specific pump or plasma/effect-site concentration.',
    'ana', array['edumon-ana'],
    '[
      {"id":"tiva-hypnotic-effect","target":"anaesthesia.hypnoticEffect","operation":"offset","value":0.85,"onsetSeconds":60,"durationSeconds":0,"recoverySeconds":300},
      {"id":"tiva-respiratory-drive","target":"respiration.drive","operation":"multiplier","value":0.55,"onsetSeconds":60,"durationSeconds":0,"recoverySeconds":240},
      {"id":"tiva-map","target":"haemodynamics.meanArterialPressure","operation":"offset","value":-12,"onsetSeconds":60,"durationSeconds":0,"recoverySeconds":240}
    ]'::jsonb,
    50, now(), now()
  ),
  (
    'surgery', 'event', 'Surgery', 'toggle', null, 0,
    'Toggle sustained operative nociceptive stimulus for the duration of surgery. Response is attenuated by analgesia and anaesthetic depth.',
    'ana', array['edumon-ana'],
    '[{"id":"surgery-sympathetic-stimulus","target":"stimulus.sympathetic","operation":"offset","value":0.75,"onsetSeconds":5,"durationSeconds":0,"recoverySeconds":30}]'::jsonb,
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

delete from public.edusim_action_definitions where id = 'surgical-stimulus';
