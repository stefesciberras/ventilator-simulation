insert into public.edusim_action_definitions (
  id, kind, name, short_press_action, long_press_action, duration_seconds,
  description, setting, environments, effects, sort_order, created_at, updated_at
)
values
  ('hypertension','event','Hypertension','toggle',null,0,'Toggle sustained hypertension.','ana',array['edumon-ana'],
   '[{"id":"hypertension-map","target":"haemodynamics.meanArterialPressure","operation":"offset","value":30,"onsetSeconds":15,"durationSeconds":0,"recoverySeconds":30}]'::jsonb,110,now(),now()),
  ('hypotension','event','Hypotension','toggle',null,0,'Toggle sustained hypotension.','ana',array['edumon-ana'],
   '[{"id":"hypotension-map","target":"haemodynamics.meanArterialPressure","operation":"offset","value":-30,"onsetSeconds":15,"durationSeconds":0,"recoverySeconds":30}]'::jsonb,120,now(),now()),
  ('tachycardia','event','Tachycardia','toggle',null,0,'Toggle sustained tachycardia.','ana',array['edumon-ana'],
   '[{"id":"tachycardia-heart-rate","target":"haemodynamics.heartRate","operation":"offset","value":40,"onsetSeconds":10,"durationSeconds":0,"recoverySeconds":20}]'::jsonb,130,now(),now()),
  ('bradycardia','event','Bradycardia','toggle',null,0,'Toggle sustained bradycardia.','ana',array['edumon-ana'],
   '[{"id":"bradycardia-heart-rate","target":"haemodynamics.heartRate","operation":"offset","value":-35,"onsetSeconds":10,"durationSeconds":0,"recoverySeconds":20}]'::jsonb,140,now(),now()),
  ('hypovolaemia','event','Hypovolaemia','toggle','severity-levels',0,'Toggle hypovolaemia. Long press selects low, medium or high severity.','ana',array['edumon-ana'],
   '[{"id":"hypovolaemia-map","target":"haemodynamics.meanArterialPressure","operation":"offset","value":-20,"onsetSeconds":30,"durationSeconds":0,"recoverySeconds":90},{"id":"hypovolaemia-heart-rate","target":"haemodynamics.heartRate","operation":"offset","value":15,"onsetSeconds":30,"durationSeconds":0,"recoverySeconds":90}]'::jsonb,150,now(),now()),
  ('bleeding','event','Bleeding','toggle','severity-levels',0,'Toggle active bleeding. Long press selects low, medium or high severity.','ana',array['edumon-ana'],
   '[{"id":"bleeding-map","target":"haemodynamics.meanArterialPressure","operation":"offset","value":-25,"onsetSeconds":20,"durationSeconds":0,"recoverySeconds":120},{"id":"bleeding-heart-rate","target":"haemodynamics.heartRate","operation":"offset","value":20,"onsetSeconds":20,"durationSeconds":0,"recoverySeconds":120}]'::jsonb,160,now(),now()),
  ('apnoea','event','Apnoea','toggle',null,0,'Toggle absent spontaneous respiratory drive.','ana',array['edumon-ana'],
   '[{"id":"apnoea-respiratory-drive","target":"respiration.drive","operation":"set","value":0,"onsetSeconds":2,"durationSeconds":0,"recoverySeconds":5}]'::jsonb,210,now(),now()),
  ('diaphragm-return','event','Return of diaphragm breathing','momentary',null,0,'Return of spontaneous diaphragmatic effort after reversal; also guarantees at least one TOF response.','ana',array['edumon-ana'],
   '[{"id":"diaphragm-return-drive","target":"respiration.drive","operation":"target","value":1,"onsetSeconds":10,"durationSeconds":900,"recoverySeconds":60},{"id":"diaphragm-return-tof","target":"neuromuscular.tofMinimumCount","operation":"target","value":1,"onsetSeconds":5,"durationSeconds":900,"recoverySeconds":60}]'::jsonb,220,now(),now()),
  ('bronchospasm','event','Bronchospasm','toggle','severity-levels',0,'Toggle bronchospasm. Long press selects low, medium or high severity.','ana',array['edumon-ana'],
   '[{"id":"bronchospasm-airway-obstruction","target":"respiration.airwayObstruction","operation":"offset","value":0.55,"onsetSeconds":10,"durationSeconds":0,"recoverySeconds":45}]'::jsonb,230,now(),now())
on conflict (id) do update set
  kind=excluded.kind,
  name=excluded.name,
  short_press_action=excluded.short_press_action,
  long_press_action=excluded.long_press_action,
  duration_seconds=excluded.duration_seconds,
  description=excluded.description,
  setting=excluded.setting,
  environments=excluded.environments,
  effects=excluded.effects,
  sort_order=excluded.sort_order,
  updated_at=now();
