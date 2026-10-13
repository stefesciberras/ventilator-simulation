create table if not exists public.case_media (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  title text not null,
  media_kind text not null check (media_kind in ('image', 'video')),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_media_title_length check (char_length(trim(title)) between 1 and 120)
);

create index if not exists case_media_owner_created_idx
  on public.case_media (instructor_id, created_at desc);

create table if not exists public.teaching_session_media (
  session_id uuid not null references public.teaching_sessions(id) on delete cascade,
  media_id uuid not null references public.case_media(id) on delete cascade,
  released boolean not null default false,
  sort_order integer not null default 0,
  added_at timestamptz not null default now(),
  released_at timestamptz,
  primary key (session_id, media_id)
);

create index if not exists teaching_session_media_session_idx
  on public.teaching_session_media (session_id, released, sort_order, added_at);

alter table public.case_media enable row level security;
alter table public.teaching_session_media enable row level security;

grant select, insert, update, delete on public.case_media to authenticated;
grant select, insert, update, delete on public.teaching_session_media to authenticated;
revoke all on public.case_media from anon;
revoke all on public.teaching_session_media from anon;

-- Persistent media belongs only to permanent instructor accounts. Candidates may
-- read metadata only after the item has been explicitly released into a room
-- they have joined.
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
);

drop policy if exists "Instructor creates own case media" on public.case_media;
create policy "Instructor creates own case media"
on public.case_media
for insert
to authenticated
with check (
  instructor_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
);

drop policy if exists "Instructor updates own case media" on public.case_media;
create policy "Instructor updates own case media"
on public.case_media
for update
to authenticated
using (
  instructor_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
)
with check (
  instructor_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
);

drop policy if exists "Instructor deletes own case media" on public.case_media;
create policy "Instructor deletes own case media"
on public.case_media
for delete
to authenticated
using (
  instructor_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
);

-- The instructor can manage all media rows for their own room. Candidates only
-- see released rows for rooms in which they are members.
drop policy if exists "Session media visible to instructor and released candidates" on public.teaching_session_media;
create policy "Session media visible to instructor and released candidates"
on public.teaching_session_media
for select
to authenticated
using (
  exists (
    select 1 from public.teaching_sessions ts
    where ts.id = teaching_session_media.session_id
      and ts.instructor_id = (select auth.uid())
  )
  or (
    released = true
    and exists (
      select 1 from public.session_members sm
      where sm.session_id = teaching_session_media.session_id
        and sm.user_id = (select auth.uid())
    )
  )
);

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
  and exists (
    select 1 from public.case_media cm
    where cm.id = teaching_session_media.media_id
      and cm.instructor_id = (select auth.uid())
  )
);

drop policy if exists "Instructor updates session media" on public.teaching_session_media;
create policy "Instructor updates session media"
on public.teaching_session_media
for update
to authenticated
using (
  exists (
    select 1 from public.teaching_sessions ts
    where ts.id = teaching_session_media.session_id
      and ts.instructor_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.teaching_sessions ts
    where ts.id = teaching_session_media.session_id
      and ts.instructor_id = (select auth.uid())
  )
);

drop policy if exists "Instructor removes session media" on public.teaching_session_media;
create policy "Instructor removes session media"
on public.teaching_session_media
for delete
to authenticated
using (
  exists (
    select 1 from public.teaching_sessions ts
    where ts.id = teaching_session_media.session_id
      and ts.instructor_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-media',
  'case-media',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage remains private. Read permission is derived from case_media RLS, so a
-- candidate can create a signed URL only after the instructor releases the item.
drop policy if exists "Read authorised case media objects" on storage.objects;
create policy "Read authorised case media objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'case-media'
  and exists (
    select 1 from public.case_media cm
    where cm.storage_path = name
  )
);

drop policy if exists "Permanent instructor uploads case media objects" on storage.objects;
create policy "Permanent instructor uploads case media objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'case-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
);

drop policy if exists "Permanent instructor updates case media objects" on storage.objects;
create policy "Permanent instructor updates case media objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'case-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
)
with check (
  bucket_id = 'case-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
);

drop policy if exists "Permanent instructor deletes case media objects" on storage.objects;
create policy "Permanent instructor deletes case media objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'case-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'teaching_session_media'
  ) then
    alter publication supabase_realtime add table public.teaching_session_media;
  end if;
end
$$;
