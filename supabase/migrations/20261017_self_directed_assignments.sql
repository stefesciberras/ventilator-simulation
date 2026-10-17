create extension if not exists pgcrypto;

create table if not exists public.self_directed_assignments (
  id uuid primary key default gen_random_uuid(),
  access_code text not null unique,
  instructor_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  scenario jsonb not null,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint self_directed_assignment_title_not_blank check (length(trim(title)) > 0)
);

create index if not exists self_directed_assignments_instructor_idx
  on public.self_directed_assignments(instructor_id, created_at desc);
create index if not exists self_directed_assignments_expiry_idx
  on public.self_directed_assignments(expires_at);

create table if not exists public.self_directed_runs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.self_directed_assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  current_stage integer not null default 0 check (current_stage >= 0),
  status text not null default 'active' check (status in ('active','completed'))
);

create index if not exists self_directed_runs_assignment_idx
  on public.self_directed_runs(assignment_id, started_at desc);
create index if not exists self_directed_runs_user_idx
  on public.self_directed_runs(user_id, started_at desc);

alter table public.self_directed_assignments enable row level security;
alter table public.self_directed_runs enable row level security;

drop policy if exists "Instructors can read own self-directed assignments" on public.self_directed_assignments;
drop policy if exists "Instructors can update own self-directed assignments" on public.self_directed_assignments;
drop policy if exists "Instructors can delete own self-directed assignments" on public.self_directed_assignments;
drop policy if exists "Candidates can read own self-directed runs" on public.self_directed_runs;

create policy "Instructors can read own self-directed assignments"
  on public.self_directed_assignments for select
  to authenticated
  using (instructor_id = auth.uid());

create policy "Instructors can update own self-directed assignments"
  on public.self_directed_assignments for update
  to authenticated
  using (instructor_id = auth.uid())
  with check (instructor_id = auth.uid());

create policy "Instructors can delete own self-directed assignments"
  on public.self_directed_assignments for delete
  to authenticated
  using (instructor_id = auth.uid());

create policy "Candidates can read own self-directed runs"
  on public.self_directed_runs for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.make_self_directed_access_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
    exit when not exists (
      select 1 from public.self_directed_assignments where access_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

create or replace function public.create_self_directed_assignment(
  p_title text,
  p_scenario jsonb,
  p_expires_at timestamptz
)
returns table (assignment_id uuid, access_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  code text;
  created_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'An instructor account is required to publish a self-directed session';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'A scenario title is required'; end if;
  if p_scenario is null then raise exception 'A scenario snapshot is required'; end if;
  if p_expires_at <= now() then raise exception 'Expiry must be in the future'; end if;
  if p_expires_at > now() + interval '365 days' then raise exception 'Expiry cannot exceed 365 days'; end if;

  code := public.make_self_directed_access_code();
  insert into public.self_directed_assignments(access_code, instructor_id, title, scenario, expires_at)
  values (code, uid, trim(p_title), p_scenario, p_expires_at)
  returning id into created_id;

  return query select created_id, code, p_expires_at;
end;
$$;

create or replace function public.start_self_directed_run(p_access_code text)
returns table (
  run_id uuid,
  assignment_id uuid,
  title text,
  scenario jsonb,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  assignment public.self_directed_assignments%rowtype;
  created_run_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select * into assignment
  from public.self_directed_assignments
  where access_code = upper(regexp_replace(coalesce(p_access_code,''), '[^A-Za-z0-9]', '', 'g'))
  limit 1;

  if assignment.id is null then raise exception 'Self-directed session not found'; end if;
  if assignment.status <> 'active' then raise exception 'This self-directed session has been revoked'; end if;
  if assignment.expires_at <= now() then raise exception 'This self-directed session has expired'; end if;

  insert into public.self_directed_runs(assignment_id, user_id)
  values (assignment.id, uid)
  returning id into created_run_id;

  return query
    select created_run_id, assignment.id, assignment.title, assignment.scenario, assignment.expires_at;
end;
$$;

create or replace function public.update_self_directed_run(
  p_run_id uuid,
  p_current_stage integer,
  p_completed boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  update public.self_directed_runs
  set current_stage = greatest(0, p_current_stage),
      status = case when p_completed then 'completed' else status end,
      completed_at = case when p_completed then coalesce(completed_at, now()) else completed_at end,
      updated_at = now()
  where id = p_run_id and user_id = uid;

  if not found then raise exception 'Self-directed run not found'; end if;
end;
$$;

revoke all on function public.make_self_directed_access_code() from public;
revoke all on function public.create_self_directed_assignment(text,jsonb,timestamptz) from public;
revoke all on function public.start_self_directed_run(text) from public;
revoke all on function public.update_self_directed_run(uuid,integer,boolean) from public;

grant execute on function public.create_self_directed_assignment(text,jsonb,timestamptz) to authenticated;
grant execute on function public.start_self_directed_run(text) to authenticated;
grant execute on function public.update_self_directed_run(uuid,integer,boolean) to authenticated;
