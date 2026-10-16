create policy "Teaching library requires permanent instructor"
  on public.teaching_library_items
  as restrictive
  for all
  to authenticated
  using (((select auth.jwt())->>'is_anonymous')::boolean is false)
  with check (((select auth.jwt())->>'is_anonymous')::boolean is false);
