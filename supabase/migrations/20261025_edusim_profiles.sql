create table if not exists public.edusim_profiles (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references auth.users(id) on delete cascade,
  product text not null check (product in ('mv','anaesth','icu')),
  name text not null,
  base_key text,
  values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists edusim_profiles_owner_product_name_idx
  on public.edusim_profiles (instructor_id, product, lower(name));

create unique index if not exists edusim_profiles_owner_product_base_idx
  on public.edusim_profiles (instructor_id, product, base_key)
  where base_key is not null;

alter table public.edusim_profiles enable row level security;

grant select, insert, update, delete on public.edusim_profiles to authenticated;

create policy "edusim_profiles_select_own"
  on public.edusim_profiles for select to authenticated
  using ((select auth.uid()) = instructor_id);

create policy "edusim_profiles_insert_own"
  on public.edusim_profiles for insert to authenticated
  with check ((select auth.uid()) = instructor_id);

create policy "edusim_profiles_update_own"
  on public.edusim_profiles for update to authenticated
  using ((select auth.uid()) = instructor_id)
  with check ((select auth.uid()) = instructor_id);

create policy "edusim_profiles_delete_own"
  on public.edusim_profiles for delete to authenticated
  using ((select auth.uid()) = instructor_id);
