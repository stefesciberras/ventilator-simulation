-- EDUVENT v0.46: ventilator sharing and candidate edit permission must be independent.

alter table public.teaching_sessions
  alter column candidate_can_edit_ventilator set default false;

update public.teaching_sessions
set candidate_can_edit_ventilator = false
where status = 'active'
  and sync_ventilator = false;

create or replace function public.reset_candidate_ventilator_edit_when_unshared()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.sync_ventilator = true and new.sync_ventilator = false then
    new.candidate_can_edit_ventilator := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_candidate_ventilator_edit_when_unshared on public.teaching_sessions;
create trigger trg_reset_candidate_ventilator_edit_when_unshared
before update on public.teaching_sessions
for each row
execute function public.reset_candidate_ventilator_edit_when_unshared();
