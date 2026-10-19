-- Scenario Builder v0.4: allow candidates running a self-directed assignment
-- to read media referenced by media stages in that immutable assignment snapshot.

drop policy if exists "Instructor owns case media and candidates read released media" on public.case_media;
create policy "Instructor owns case media and candidates read released media"
on public.case_media
for select
to authenticated
using (
  (
    instructor_id = (select auth.uid())
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
  )
  or exists (
    select 1
    from public.teaching_session_media tsm
    join public.session_members sm on sm.session_id = tsm.session_id
    join public.teaching_sessions ts on ts.id = tsm.session_id
    where tsm.media_id = case_media.id
      and tsm.released = true
      and sm.user_id = (select auth.uid())
      and ts.status <> 'ended'
      and ts.expires_at > now()
  )
  or exists (
    select 1
    from public.self_directed_runs sdr
    join public.self_directed_assignments sda on sda.id = sdr.assignment_id
    cross join lateral jsonb_array_elements(coalesce(sda.scenario -> 'stages', '[]'::jsonb)) stage
    where sdr.user_id = (select auth.uid())
      and sdr.status in ('active', 'completed')
      and stage ->> 'stageType' = 'media'
      and stage #>> '{media,mediaId}' = case_media.id::text
  )
);
