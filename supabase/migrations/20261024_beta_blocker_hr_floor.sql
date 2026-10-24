-- Refine Beta blocker cardiovascular physiology: modest bradycardia, suppression of
-- lower-priority positive chronotropy, and a 50 bpm minimum HR constraint.
update public.edusim_action_definitions
set effects = '[
  {"id":"beta-blocker-heart-rate-offset","target":"haemodynamics.heartRate","operation":"offset","value":-15,"onsetSeconds":10,"durationSeconds":0,"recoverySeconds":30},
  {"id":"beta-blocker-positive-chronotropy","target":"haemodynamics.heartRate","operation":"constraint","constraint":"block-increase","value":0,"onsetSeconds":10,"durationSeconds":0,"recoverySeconds":30},
  {"id":"beta-blocker-heart-rate-floor","target":"haemodynamics.heartRate","operation":"constraint","constraint":"minimum","value":50,"onsetSeconds":10,"durationSeconds":0,"recoverySeconds":30}
]'::jsonb,
    updated_at = now()
where id = 'beta-blocker';
