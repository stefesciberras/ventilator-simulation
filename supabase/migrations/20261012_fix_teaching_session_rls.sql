-- EDUVENT teaching sessions: make RLS membership checks non-recursive.
--
-- The original teaching_sessions SELECT policy queried session_members while the
-- session_members SELECT policy queried teaching_sessions. For candidate users,
-- PostgreSQL can recurse through both RLS policies. These SECURITY DEFINER helper
-- functions perform the membership/ownership checks without invoking the caller's
-- RLS policies, then the policies call the helpers.

create or replace function public.is_teaching_session_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_members m
    where m.session_id = p_session_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_teaching_session_instructor(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teaching_sessions s
    where s.id = p_session_id
      and s.instructor_id = auth.uid()
  );
$$;

revoke all on function public.is_teaching_session_member(uuid) from public;
revoke all on function public.is_teaching_session_instructor(uuid) from public;
grant execute on function public.is_teaching_session_member(uuid) to authenticated;
grant execute on function public.is_teaching_session_instructor(uuid) to authenticated;

drop policy if exists "Members can read their sessions" on public.teaching_sessions;
create policy "Members can read their sessions"
on public.teaching_sessions
for select
to authenticated
using (
  instructor_id = auth.uid()
  or public.is_teaching_session_member(id)
);

drop policy if exists "Session members can view membership" on public.session_members;
create policy "Session members can view membership"
on public.session_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_teaching_session_instructor(session_id)
);
