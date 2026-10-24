create table public.edusim_action_definitions (
  id text primary key,
  kind text not null check (kind in ('drug', 'event')),
  name text not null,
  short_press_action text not null default 'momentary' check (short_press_action in ('momentary', 'toggle')),
  long_press_action text,
  duration_seconds numeric(8,2) not null default 0 check (duration_seconds >= 0),
  description text not null default '',
  environments text[] not null default array['edumon-ana']::text[],
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edusim_action_definition_id_format check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint edusim_action_definition_environments check (
    cardinality(environments) > 0
    and environments <@ array['edumon-ana','edumon-icu']::text[]
  )
);

alter table public.edusim_action_definitions enable row level security;

revoke all on table public.edusim_action_definitions from anon, authenticated;
grant select, insert, update, delete on table public.edusim_action_definitions to authenticated;

create policy "Action definitions permanent instructors read"
  on public.edusim_action_definitions
  for select
  to authenticated
  using (((select auth.jwt())->>'is_anonymous')::boolean is false);

create policy "Action definitions permanent instructors insert"
  on public.edusim_action_definitions
  for insert
  to authenticated
  with check (((select auth.jwt())->>'is_anonymous')::boolean is false);

create policy "Action definitions permanent instructors update"
  on public.edusim_action_definitions
  for update
  to authenticated
  using (((select auth.jwt())->>'is_anonymous')::boolean is false)
  with check (((select auth.jwt())->>'is_anonymous')::boolean is false);

create policy "Action definitions permanent instructors delete"
  on public.edusim_action_definitions
  for delete
  to authenticated
  using (((select auth.jwt())->>'is_anonymous')::boolean is false);

insert into public.edusim_action_definitions (id, kind, name, short_press_action, duration_seconds, description, environments, sort_order)
values
  ('propofol', 'drug', 'Propofol', 'momentary', 0, '', array['edumon-ana'], 10),
  ('fentanyl', 'drug', 'Fentanyl', 'momentary', 0, '', array['edumon-ana'], 20),
  ('relaxant', 'drug', 'Relaxant', 'momentary', 0, '', array['edumon-ana'], 30),
  ('tiva', 'drug', 'TIVA', 'toggle', 0, '', array['edumon-ana'], 40),
  ('induction', 'event', 'Induction', 'momentary', 0, '', array['edumon-ana'], 10),
  ('maintenance', 'event', 'Maintenance', 'momentary', 0, '', array['edumon-ana'], 20),
  ('awakening', 'event', 'Awakening', 'momentary', 0, '', array['edumon-ana'], 30);
