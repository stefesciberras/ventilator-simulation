create table if not exists public.instructor_presets (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  scenario jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructor_presets_name_length check (char_length(trim(name)) between 1 and 80)
);

create unique index if not exists instructor_presets_owner_name_key
  on public.instructor_presets (instructor_id, lower(trim(name)));

create index if not exists instructor_presets_owner_updated_idx
  on public.instructor_presets (instructor_id, updated_at desc);

alter table public.instructor_presets enable row level security;

grant select, insert, update, delete on public.instructor_presets to authenticated;
revoke all on public.instructor_presets from anon;

-- Anonymous teaching users also carry the authenticated Postgres role. Presets
-- are therefore explicitly restricted to permanent instructor identities.
drop policy if exists "Instructor can read own presets" on public.instructor_presets;
create policy "Instructor can read own presets"
on public.instructor_presets
for select
to authenticated
using (
  instructor_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
);

drop policy if exists "Instructor can create own presets" on public.instructor_presets;
create policy "Instructor can create own presets"
on public.instructor_presets
for insert
to authenticated
with check (
  instructor_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
);

drop policy if exists "Instructor can update own presets" on public.instructor_presets;
create policy "Instructor can update own presets"
on public.instructor_presets
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

drop policy if exists "Instructor can delete own presets" on public.instructor_presets;
create policy "Instructor can delete own presets"
on public.instructor_presets
for delete
to authenticated
using (
  instructor_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
);