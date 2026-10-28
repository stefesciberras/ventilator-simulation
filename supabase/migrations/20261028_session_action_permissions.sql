-- Session-scoped candidate availability for instructor-controlled Drugs & Events.
create table if not exists private.edusim_session_action_permissions (
  session_id uuid not null references public.teaching_sessions(id) on delete cascade,
  action_id text not null,
  allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (session_id, action_id)
);

create or replace function private.edusim_active_session_for_role(p_product_id text, p_actor_role text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare result uuid;
begin
  if auth.uid() is null then return null; end if;
  if p_actor_role = 'instructor' then
    select s.id into result from public.teaching_sessions s
    where s.product_id = p_product_id and s.instructor_id = auth.uid()
      and s.status <> 'ended' and s.expires_at > now()
    order by s.updated_at desc, s.created_at desc limit 1;
  elsif p_actor_role = 'candidate' then
    select s.id into result from public.session_members m
    join public.teaching_sessions s on s.id = m.session_id
    where s.product_id = p_product_id and m.user_id = auth.uid() and m.role = 'candidate'
      and s.status <> 'ended' and s.expires_at > now()
    order by m.joined_at desc limit 1;
  end if;
  return result;
end;
$$;

revoke all on function private.edusim_active_session_for_role(text, text) from public, anon, authenticated;

create or replace function public.list_edusim_candidate_action_permissions(p_product_id text, p_actor_role text)
returns table(action_id text)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare target_session uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_actor_role not in ('instructor', 'candidate') then raise exception 'Invalid session role'; end if;
  target_session := private.edusim_active_session_for_role(p_product_id, p_actor_role);
  if target_session is null then return; end if;
  return query select p.action_id from private.edusim_session_action_permissions p
    where p.session_id = target_session and p.allowed = true order by p.action_id;
end;
$$;

revoke all on function public.list_edusim_candidate_action_permissions(text, text) from public, anon;
grant execute on function public.list_edusim_candidate_action_permissions(text, text) to authenticated;

create or replace function public.set_edusim_candidate_action_permission(p_product_id text, p_action_id text, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare target_session uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  target_session := private.edusim_active_session_for_role(p_product_id, 'instructor');
  if target_session is null then raise exception 'Active instructor session not found'; end if;
  if coalesce(trim(p_action_id), '') = '' then raise exception 'Action id required'; end if;
  if p_allowed then
    insert into private.edusim_session_action_permissions(session_id, action_id, allowed, updated_at, updated_by)
    values (target_session, p_action_id, true, now(), auth.uid())
    on conflict (session_id, action_id) do update
      set allowed = true, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  else
    delete from private.edusim_session_action_permissions
      where session_id = target_session and action_id = p_action_id;
  end if;
end;
$$;

revoke all on function public.set_edusim_candidate_action_permission(text, text, boolean) from public, anon;
grant execute on function public.set_edusim_candidate_action_permission(text, text, boolean) to authenticated;
