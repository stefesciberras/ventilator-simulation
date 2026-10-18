alter table public.teaching_sessions
  add column if not exists candidate_controls_visible boolean not null default true;

create or replace function private.owns_case_media(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.case_media cm
      where cm.id = p_media_id
        and cm.instructor_id = (select auth.uid())
    );
$$;

create or replace function private.can_read_case_media(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.case_media cm
        where cm.id = p_media_id
          and cm.instructor_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.teaching_session_media tsm
        join public.session_members sm on sm.session_id = tsm.session_id
        join public.teaching_sessions ts on ts.id = tsm.session_id
        where tsm.media_id = p_media_id
          and tsm.released = true
          and sm.user_id = (select auth.uid())
          and ts.status <> 'ended'
          and ts.expires_at > now()
      )
      or exists (
        select 1
        from public.teaching_media_presentations tmp
        join public.session_members sm on sm.session_id = tmp.session_id
        join public.teaching_sessions ts on ts.id = tmp.session_id
        where tmp.media_id = p_media_id
          and tmp.status = 'active'
          and sm.user_id = (select auth.uid())
          and ts.status <> 'ended'
          and ts.expires_at > now()
      )
    );
$$;

revoke all on function private.owns_case_media(uuid) from public;
revoke all on function private.can_read_case_media(uuid) from public;
grant execute on function private.owns_case_media(uuid) to authenticated;
grant execute on function private.can_read_case_media(uuid) to authenticated;

drop policy if exists "Instructor owns case media and candidates read released media" on public.case_media;
drop policy if exists "Candidates read actively presented case media" on public.case_media;

create policy "Authorized users read case media"
on public.case_media
for select
to authenticated
using (private.can_read_case_media(id));

drop policy if exists "Instructor adds session media" on public.teaching_session_media;
create policy "Instructor adds session media"
on public.teaching_session_media
for insert
to authenticated
with check (
  exists (
    select 1 from public.teaching_sessions ts
    where ts.id = teaching_session_media.session_id
      and ts.instructor_id = (select auth.uid())
  )
  and private.owns_case_media(media_id)
);

drop policy if exists "Instructor can create media presentations" on public.teaching_media_presentations;
create policy "Instructor can create media presentations"
on public.teaching_media_presentations
for insert
to authenticated
with check (
  instructor_id = (select auth.uid())
  and exists (
    select 1 from public.teaching_sessions ts
    where ts.id = teaching_media_presentations.session_id
      and ts.instructor_id = (select auth.uid())
      and ts.status <> 'ended'
      and ts.expires_at > now()
  )
  and private.owns_case_media(media_id)
);
