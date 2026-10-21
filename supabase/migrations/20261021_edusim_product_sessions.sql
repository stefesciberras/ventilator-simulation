-- Shared EDUSIM teaching sessions: make the existing teaching session backend product-aware
-- while preserving EDUVENT compatibility.

alter table public.teaching_sessions
  add column if not exists product_id text not null default 'eduvent',
  add column if not exists product_state jsonb not null default '{}'::jsonb,
  add column if not exists product_state_revision bigint not null default 0;

alter table public.session_members
  add column if not exists product_state jsonb not null default '{}'::jsonb;

update public.teaching_sessions
set product_id = 'eduvent'
where product_id is null or btrim(product_id) = '';

create index if not exists teaching_sessions_instructor_product_active_idx
  on public.teaching_sessions (instructor_id, product_id, created_at desc)
  where status <> 'ended';

create or replace function public.create_edusim_session(
  p_product_id text,
  p_product_state jsonb default '{}'::jsonb
)
returns table(session_id uuid, session_key text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  normalized_product_id text := lower(btrim(coalesce(p_product_id, '')));
  existing_session public.teaching_sessions%rowtype;
  new_id uuid;
  new_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if normalized_product_id = '' or length(normalized_product_id) > 64 then
    raise exception 'Invalid EDUSIM product id';
  end if;

  select * into existing_session
  from public.teaching_sessions
  where instructor_id = auth.uid()
    and product_id = normalized_product_id
    and status <> 'ended'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    return query select existing_session.id, existing_session.session_key;
    return;
  end if;

  loop
    new_key := public.generate_session_key();
    exit when not exists (
      select 1 from public.teaching_sessions s where s.session_key = new_key
    );
  end loop;

  insert into public.teaching_sessions (
    session_key,
    instructor_id,
    product_id,
    product_state,
    product_state_revision
  ) values (
    new_key,
    auth.uid(),
    normalized_product_id,
    coalesce(p_product_state, '{}'::jsonb),
    1
  ) returning id into new_id;

  insert into public.session_members (session_id, user_id, role, product_state)
  values (new_id, auth.uid(), 'instructor', coalesce(p_product_state, '{}'::jsonb))
  on conflict on constraint session_members_session_user_role_key do update
    set product_state = excluded.product_state,
        last_seen = now();

  return query select new_id, new_key;
end;
$function$;

create or replace function public.join_edusim_session(
  p_session_key text,
  p_display_name text default null,
  p_product_id text default null
)
returns table(session_id uuid, session_status text, product_id text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  found_session public.teaching_sessions%rowtype;
  normalized_product_id text := nullif(lower(btrim(coalesce(p_product_id, ''))), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into found_session
  from public.teaching_sessions
  where teaching_sessions.session_key = upper(trim(p_session_key))
    and teaching_sessions.status <> 'ended'
    and teaching_sessions.expires_at > now()
    and (normalized_product_id is null or teaching_sessions.product_id = normalized_product_id);

  if not found then
    raise exception 'Session not found, expired, or belongs to another simulator';
  end if;

  insert into public.session_members (
    session_id, user_id, role, display_name, last_seen, product_state
  ) values (
    found_session.id, auth.uid(), 'candidate', nullif(btrim(p_display_name), ''), now(), '{}'::jsonb
  )
  on conflict on constraint session_members_session_user_role_key
  do update set
    display_name = excluded.display_name,
    last_seen = now();

  return query select found_session.id, found_session.status, found_session.product_id;
end;
$function$;

create or replace function public.find_active_instructor_session(p_product_id text)
returns table(session_id uuid, session_key text)
language sql
security definer
set search_path = public
as $function$
  select s.id, s.session_key
  from public.teaching_sessions s
  where auth.uid() is not null
    and s.instructor_id = auth.uid()
    and s.product_id = lower(btrim(p_product_id))
    and s.status <> 'ended'
    and s.expires_at > now()
  order by s.created_at desc
  limit 1;
$function$;

create or replace function public.touch_edusim_session_member(
  p_session_id uuid,
  p_product_state jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.teaching_sessions s
    where s.id = p_session_id
      and s.status <> 'ended'
      and s.expires_at > now()
  ) then
    raise exception 'Teaching session expired or ended';
  end if;

  update public.session_members
  set last_seen = now(),
      product_state = coalesce(p_product_state, '{}'::jsonb),
      state_updated_at = now()
  where session_id = p_session_id
    and user_id = auth.uid()
    and role = 'candidate';

  if not found then
    raise exception 'Candidate session membership not found';
  end if;
end;
$function$;

-- EDUVENT compatibility: keep its existing RPC names but scope them explicitly to EDUVENT.
create or replace function public.create_teaching_session(
  p_patient_settings jsonb default '{}'::jsonb,
  p_ventilator_settings jsonb default '{}'::jsonb,
  p_alarm_settings jsonb default '{}'::jsonb
)
returns table(session_id uuid, session_key text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  existing_session public.teaching_sessions%rowtype;
  new_id uuid;
  new_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into existing_session
  from public.teaching_sessions
  where instructor_id = auth.uid()
    and product_id = 'eduvent'
    and status <> 'ended'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    return query select existing_session.id, existing_session.session_key;
    return;
  end if;

  loop
    new_key := public.generate_session_key();
    exit when not exists (
      select 1 from public.teaching_sessions where teaching_sessions.session_key = new_key
    );
  end loop;

  insert into public.teaching_sessions (
    session_key,
    instructor_id,
    product_id,
    patient_settings,
    ventilator_settings,
    alarm_settings,
    product_state,
    product_state_revision
  ) values (
    new_key,
    auth.uid(),
    'eduvent',
    p_patient_settings,
    p_ventilator_settings,
    p_alarm_settings,
    jsonb_build_object(
      'patient', coalesce(p_patient_settings, '{}'::jsonb),
      'ventilator', coalesce(p_ventilator_settings, '{}'::jsonb),
      'alarms', coalesce(p_alarm_settings, '{}'::jsonb)
    ),
    1
  ) returning id into new_id;

  insert into public.session_members (session_id, user_id, role)
  values (new_id, auth.uid(), 'instructor')
  on conflict on constraint session_members_session_user_role_key do nothing;

  return query select new_id, new_key;
end;
$function$;

create or replace function public.join_teaching_session(
  p_session_key text,
  p_display_name text default null
)
returns table(session_id uuid, session_status text)
language sql
security definer
set search_path = public
as $function$
  select j.session_id, j.session_status
  from public.join_edusim_session(p_session_key, p_display_name, 'eduvent') j;
$function$;

create or replace function public.find_active_instructor_session()
returns table(session_id uuid, session_key text)
language sql
security definer
set search_path = public
as $function$
  select * from public.find_active_instructor_session('eduvent');
$function$;
