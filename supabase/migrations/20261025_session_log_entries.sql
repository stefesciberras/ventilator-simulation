create table if not exists public.edusim_session_log_entries (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.teaching_sessions(id) on delete cascade,
  product_id text not null,
  actor_user_id uuid not null,
  actor_role text not null check (actor_role in ('instructor', 'candidate')),
  actor_name text not null,
  category text not null check (category in ('settings', 'drug', 'event', 'alarm', 'device', 'session', 'scenario')),
  event_type text not null,
  label text not null,
  details jsonb not null default '{}'::jsonb,
  simulation_time_seconds double precision,
  client_occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint edusim_session_log_event_type_length check (char_length(event_type) between 1 and 100),
  constraint edusim_session_log_label_length check (char_length(label) between 1 and 240)
);

create index if not exists edusim_session_log_entries_session_order_idx
  on public.edusim_session_log_entries (session_id, id);

alter table public.edusim_session_log_entries enable row level security;

drop policy if exists "Session members can append session log" on public.edusim_session_log_entries;
create policy "Session members can append session log"
  on public.edusim_session_log_entries
  for insert
  to authenticated
  with check (private.is_teaching_session_member(session_id));

drop policy if exists "Instructor can read complete session log" on public.edusim_session_log_entries;
create policy "Instructor can read complete session log"
  on public.edusim_session_log_entries
  for select
  to authenticated
  using (
    private.is_teaching_session_instructor(session_id)
    or actor_user_id = (select auth.uid())
  );

grant select, insert on public.edusim_session_log_entries to authenticated;
grant usage, select on sequence public.edusim_session_log_entries_id_seq to authenticated;

create or replace function private.prepare_edusim_session_log_entry()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  member_role text;
  member_name text;
  session_product text;
  session_status text;
  session_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select s.product_id, s.status, s.expires_at
    into session_product, session_status, session_expires_at
  from public.teaching_sessions s
  where s.id = new.session_id;

  if session_product is null then
    raise exception 'Teaching session not found';
  end if;
  if session_status = 'ended' or session_expires_at <= now() then
    raise exception 'Teaching session expired or ended';
  end if;

  select sm.role, sm.display_name
    into member_role, member_name
  from public.session_members sm
  where sm.session_id = new.session_id
    and sm.user_id = auth.uid()
  order by case sm.role when 'instructor' then 0 else 1 end
  limit 1;

  if member_role is null then
    raise exception 'Teaching session membership not found';
  end if;

  new.product_id := session_product;
  new.actor_user_id := auth.uid();
  new.actor_role := member_role;
  new.actor_name := coalesce(nullif(trim(member_name), ''), case member_role when 'instructor' then 'Instructor' else 'Candidate' end);
  new.created_at := now();
  new.client_occurred_at := coalesce(new.client_occurred_at, now());
  new.details := coalesce(new.details, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists prepare_edusim_session_log_entry on public.edusim_session_log_entries;
create trigger prepare_edusim_session_log_entry
before insert on public.edusim_session_log_entries
for each row execute function private.prepare_edusim_session_log_entry();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'edusim_session_log_entries'
  ) then
    alter publication supabase_realtime add table public.edusim_session_log_entries;
  end if;
end;
$$;
