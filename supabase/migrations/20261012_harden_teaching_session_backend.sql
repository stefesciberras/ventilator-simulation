-- EDUVENT teaching sessions: harden RPC permissions, move internal RLS helpers
-- out of the exposed public schema, fix candidate join ON CONFLICT ambiguity,
-- and optimise auth.uid() evaluation in RLS policies.

create schema if not exists private;

alter function public.is_teaching_session_member(uuid) set schema private;
alter function public.is_teaching_session_instructor(uuid) set schema private;

grant usage on schema private to authenticated;
revoke all on function private.is_teaching_session_member(uuid) from public, anon;
revoke all on function private.is_teaching_session_instructor(uuid) from public, anon;
grant execute on function private.is_teaching_session_member(uuid) to authenticated;
grant execute on function private.is_teaching_session_instructor(uuid) to authenticated;

revoke all on function public.create_teaching_session(jsonb, jsonb) from public, anon;
revoke all on function public.join_teaching_session(text, text) from public, anon;
revoke all on function public.generate_session_key() from public, anon, authenticated;
grant execute on function public.create_teaching_session(jsonb, jsonb) to authenticated;
grant execute on function public.join_teaching_session(text, text) to authenticated;

create or replace function public.join_teaching_session(
    p_session_key text,
    p_display_name text default null
)
returns table (
    session_id uuid,
    session_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    found_session public.teaching_sessions%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    select *
    into found_session
    from public.teaching_sessions
    where teaching_sessions.session_key = upper(trim(p_session_key))
      and teaching_sessions.status <> 'ended'
      and teaching_sessions.expires_at > now();

    if not found then
        raise exception 'Session not found or expired';
    end if;

    insert into public.session_members (
        session_id,
        user_id,
        role,
        display_name,
        last_seen
    )
    values (
        found_session.id,
        auth.uid(),
        'candidate',
        p_display_name,
        now()
    )
    on conflict on constraint session_members_session_id_user_id_key
    do update
    set
        display_name = excluded.display_name,
        last_seen = now();

    return query
    select found_session.id, found_session.status;
end;
$$;

revoke all on function public.join_teaching_session(text, text) from public, anon;
grant execute on function public.join_teaching_session(text, text) to authenticated;

drop policy if exists "Members can read their sessions" on public.teaching_sessions;
create policy "Members can read their sessions"
on public.teaching_sessions
for select
to authenticated
using (
  instructor_id = (select auth.uid())
  or private.is_teaching_session_member(id)
);

drop policy if exists "Instructor can update own session" on public.teaching_sessions;
create policy "Instructor can update own session"
on public.teaching_sessions
for update
to authenticated
using (instructor_id = (select auth.uid()))
with check (instructor_id = (select auth.uid()));

drop policy if exists "Instructor can delete own session" on public.teaching_sessions;
create policy "Instructor can delete own session"
on public.teaching_sessions
for delete
to authenticated
using (instructor_id = (select auth.uid()));

drop policy if exists "Session members can view membership" on public.session_members;
create policy "Session members can view membership"
on public.session_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_teaching_session_instructor(session_id)
);
