create table if not exists public.teaching_library_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_app text not null default 'shared',
  module text not null default 'General',
  kind text not null check (kind in ('message', 'mcq', 'poll')),
  title text,
  body text not null,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  correct_option_id text,
  explanation text,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teaching_library_items_owner_updated_idx
  on public.teaching_library_items(owner_id, updated_at desc);
create index if not exists teaching_library_items_owner_module_idx
  on public.teaching_library_items(owner_id, module);

alter table public.teaching_library_items enable row level security;

revoke all on public.teaching_library_items from anon;
grant select, insert, update, delete on public.teaching_library_items to authenticated;

create policy "Teaching authors can read own library"
  on public.teaching_library_items for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Teaching authors can create own library items"
  on public.teaching_library_items for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Teaching authors can update own library"
  on public.teaching_library_items for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Teaching authors can delete own library"
  on public.teaching_library_items for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
