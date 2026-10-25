alter table public.edusim_action_definitions
  add column if not exists candidate_access text not null default 'instructor-only';

alter table public.edusim_action_definitions
  drop constraint if exists edusim_action_definitions_candidate_access_check;

alter table public.edusim_action_definitions
  add constraint edusim_action_definitions_candidate_access_check
  check (candidate_access in ('allowed', 'instructor-only', 'scenario'));

update public.edusim_action_definitions
set candidate_access = 'allowed'
where kind = 'drug';

update public.edusim_action_definitions
set candidate_access = 'instructor-only'
where kind = 'event' and candidate_access = 'allowed';
