alter table public.edusim_action_definitions
  add column if not exists effects jsonb not null default '[]'::jsonb;

alter table public.edusim_action_definitions
  drop constraint if exists edusim_action_definition_effects_array;

alter table public.edusim_action_definitions
  add constraint edusim_action_definition_effects_array
  check (jsonb_typeof(effects) = 'array');

update public.edusim_action_definitions
set
  description = 'Opioid action with modest bradycardic and respiratory-depressant effects plus attenuation of nociceptive response.',
  effects = '[
    {
      "id": "fentanyl-heart-rate",
      "target": "haemodynamics.heartRate",
      "operation": "offset",
      "value": -6,
      "onsetSeconds": 15,
      "durationSeconds": 180,
      "recoverySeconds": 120
    },
    {
      "id": "fentanyl-respiratory-drive",
      "target": "respiration.drive",
      "operation": "multiplier",
      "value": 0.75,
      "onsetSeconds": 20,
      "durationSeconds": 240,
      "recoverySeconds": 180
    },
    {
      "id": "fentanyl-nociceptive-response",
      "target": "anaesthesia.nociceptiveResponse",
      "operation": "multiplier",
      "value": 0.55,
      "onsetSeconds": 15,
      "durationSeconds": 300,
      "recoverySeconds": 180
    }
  ]'::jsonb,
  updated_at = now()
where id = 'fentanyl';

update public.edusim_action_definitions
set
  id = 'atracurium',
  name = 'Atracurium',
  description = 'Non-depolarising neuromuscular blocker. The drug acts on neuromuscular block rather than directly suppressing central respiratory drive.',
  effects = '[
    {
      "id": "atracurium-neuromuscular-block",
      "target": "neuromuscular.block",
      "operation": "target",
      "value": 1.0,
      "onsetSeconds": 120,
      "durationSeconds": 1200,
      "recoverySeconds": 600
    }
  ]'::jsonb,
  updated_at = now()
where id = 'relaxant'
  and not exists (
    select 1 from public.edusim_action_definitions where id = 'atracurium'
  );

update public.edusim_action_definitions
set
  name = 'Atracurium',
  description = 'Non-depolarising neuromuscular blocker. The drug acts on neuromuscular block rather than directly suppressing central respiratory drive.',
  effects = '[
    {
      "id": "atracurium-neuromuscular-block",
      "target": "neuromuscular.block",
      "operation": "target",
      "value": 1.0,
      "onsetSeconds": 120,
      "durationSeconds": 1200,
      "recoverySeconds": 600
    }
  ]'::jsonb,
  updated_at = now()
where id = 'atracurium';
