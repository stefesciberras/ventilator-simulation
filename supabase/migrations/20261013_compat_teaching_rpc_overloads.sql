create or replace function public.create_teaching_session(
  p_patient_settings jsonb default '{}'::jsonb,
  p_ventilator_settings jsonb default '{}'::jsonb
)
returns table(session_id uuid, session_key text)
language sql
security definer
set search_path = public
as $$
  select *
  from public.create_teaching_session(
    p_patient_settings,
    p_ventilator_settings,
    '{}'::jsonb
  );
$$;

create or replace function public.touch_session_member(
  p_session_id uuid,
  p_patient_settings jsonb default '{}'::jsonb,
  p_ventilator_settings jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  select public.touch_session_member(
    p_session_id,
    p_patient_settings,
    p_ventilator_settings,
    null::text
  );
$$;

revoke execute on function public.create_teaching_session(jsonb,jsonb) from public, anon;
revoke execute on function public.touch_session_member(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.create_teaching_session(jsonb,jsonb) to authenticated;
grant execute on function public.touch_session_member(uuid,jsonb,jsonb) to authenticated;
