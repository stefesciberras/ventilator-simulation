drop policy if exists "edusim_profiles_select_own" on public.edusim_profiles;
drop policy if exists "edusim_profiles_insert_own" on public.edusim_profiles;
drop policy if exists "edusim_profiles_update_own" on public.edusim_profiles;
drop policy if exists "edusim_profiles_delete_own" on public.edusim_profiles;

create policy "edusim_profiles_select_own"
  on public.edusim_profiles for select to authenticated
  using (
    (select auth.uid()) = instructor_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
  );

create policy "edusim_profiles_insert_own"
  on public.edusim_profiles for insert to authenticated
  with check (
    (select auth.uid()) = instructor_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
  );

create policy "edusim_profiles_update_own"
  on public.edusim_profiles for update to authenticated
  using (
    (select auth.uid()) = instructor_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
  )
  with check (
    (select auth.uid()) = instructor_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
  );

create policy "edusim_profiles_delete_own"
  on public.edusim_profiles for delete to authenticated
  using (
    (select auth.uid()) = instructor_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
  );
