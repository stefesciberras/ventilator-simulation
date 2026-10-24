-- Action effects may explicitly recover when released or persist at their current contribution.
-- Existing definitions without releaseBehaviour continue to default to recover in the client.

update public.edusim_action_definitions
set effects = (
  select jsonb_agg(
    case
      when elem->>'target' in ('haemodynamics.heartRate', 'haemodynamics.meanArterialPressure')
        then jsonb_set(elem, '{releaseBehaviour}', '"persist"'::jsonb, true)
      else elem
    end
    order by ord
  )
  from jsonb_array_elements(effects) with ordinality as e(elem, ord)
), updated_at = now()
where id in ('hypovolaemia', 'bleeding');
