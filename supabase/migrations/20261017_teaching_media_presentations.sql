create table if not exists public.teaching_media_presentations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.teaching_sessions(id) on delete cascade,
  instructor_id uuid not null default auth.uid(),
  media_id uuid not null references public.case_media(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists teaching_media_presentations_session_status_created_idx
  on public.teaching_media_presentations(session_id, status, created_at desc);

alter table public.teaching_media_presentations enable row level security;

grant select, insert, update, delete on public.teaching_media_presentations to authenticated;

drop policy if exists "Teaching session members can read active media presentations" on public.teaching_media_presentations;
create policy "Teaching session members can read active media presentations"
on public.teaching_media_presentations
for select
to authenticated
using (
  instructor_id = (select auth.uid())
  or (
    status = 'active'
    and exists (
      select 1
      from public.session_members sm
      join public.teaching_sessions ts on ts.id = sm.session_id
      where sm.session_id = teaching_media_presentations.session_id
        and sm.user_id = (select auth.uid())
        and ts.status <> 'ended'
        and ts.expires_at > now()
    )
  )
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
  and exists (
    select 1 from public.case_media cm
    where cm.id = teaching_media_presentations.media_id
      and cm.instructor_id = (select auth.uid())
  )
);

drop policy if exists "Instructor can update media presentations" on public.teaching_media_presentations;
create policy "Instructor can update media presentations"
on public.teaching_media_presentations
for update
to authenticated
using (
  instructor_id = (select auth.uid())
  and exists (
    select 1 from public.teaching_sessions ts
    where ts.id = teaching_media_presentations.session_id
      and ts.instructor_id = (select auth.uid())
  )
)
with check (
  instructor_id = (select auth.uid())
  and exists (
    select 1 from public.teaching_sessions ts
    where ts.id = teaching_media_presentations.session_id
      and ts.instructor_id = (select auth.uid())
  )
);

drop policy if exists "Instructor can delete media presentations" on public.teaching_media_presentations;
create policy "Instructor can delete media presentations"
on public.teaching_media_presentations
for delete
to authenticated
using (
  instructor_id = (select auth.uid())
  and exists (
    select 1 from public.teaching_sessions ts
    where ts.id = teaching_media_presentations.session_id
      and ts.instructor_id = (select auth.uid())
  )
);

-- A candidate may read the case_media row (and therefore obtain its signed
-- storage URL) only while that media item is actively being presented in a
-- session they have joined. Existing released-media access remains separate.
drop policy if exists "Candidates read actively presented case media" on public.case_media;
create policy "Candidates read actively presented case media"
on public.case_media
for select
to authenticated
using (
  exists (
    select 1
    from public.teaching_media_presentations tmp
    join public.session_members sm on sm.session_id = tmp.session_id
    join public.teaching_sessions ts on ts.id = tmp.session_id
    where tmp.media_id = case_media.id
      and tmp.status = 'active'
      and sm.user_id = (select auth.uid())
      and ts.status <> 'ended'
      and ts.expires_at > now()
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'teaching_media_presentations'
  ) then
    alter publication supabase_realtime add table public.teaching_media_presentations;
  end if;
end $$;
