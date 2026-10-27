-- Simulation product_state is authoritative only when written through the validated
-- central mutation RPC. Legacy/direct teaching-session updates must not be able to
-- replace canonical Simulation state or flip runtimeMode back to Teaching.

create or replace function private.guard_simulation_canonical_state()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  old_mode text := old.product_state ->> 'runtimeMode';
  logical_role text := nullif(current_setting('loppjusim.actor_role', true), '');
begin
  if old_mode = 'simulation'
     and new.product_state is distinct from old.product_state
     and logical_role not in ('instructor', 'candidate') then
    new.product_state := old.product_state;
    new.product_state_revision := old.product_state_revision;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_simulation_canonical_state() from public, anon, authenticated;

drop trigger if exists guard_simulation_canonical_state on public.teaching_sessions;
create trigger guard_simulation_canonical_state
before update on public.teaching_sessions
for each row execute function private.guard_simulation_canonical_state();

revoke all on function public.apply_edusim_simulation_patch(uuid, bigint, jsonb, uuid) from public, anon, authenticated;
