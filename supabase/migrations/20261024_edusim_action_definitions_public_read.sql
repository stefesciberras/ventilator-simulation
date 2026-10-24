drop policy if exists "Action definitions permanent instructors read" on public.edusim_action_definitions;
revoke all on table public.edusim_action_definitions from anon, authenticated;
grant select on table public.edusim_action_definitions to anon, authenticated;
grant insert, update, delete on table public.edusim_action_definitions to authenticated;

create policy "Action definitions public read"
  on public.edusim_action_definitions
  for select
  to anon, authenticated
  using (true);
