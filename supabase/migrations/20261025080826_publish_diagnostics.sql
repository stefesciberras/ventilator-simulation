create table if not exists public.edusim_published_diagnostics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  product_label text not null,
  app_version text not null,
  kind text not null,
  diagnostic jsonb not null,
  constraint edusim_published_diagnostics_diagnostic_object check (jsonb_typeof(diagnostic) = 'object')
);

alter table public.edusim_published_diagnostics enable row level security;

revoke all on table public.edusim_published_diagnostics from anon, authenticated;
grant select, insert, delete on table public.edusim_published_diagnostics to authenticated;

create index if not exists edusim_published_diagnostics_created_by_created_at_idx
  on public.edusim_published_diagnostics (created_by, created_at desc);
create index if not exists edusim_published_diagnostics_product_created_at_idx
  on public.edusim_published_diagnostics (product_id, created_at desc);

create policy "Permanent instructors can read own diagnostics"
  on public.edusim_published_diagnostics
  for select
  to authenticated
  using (
    (select auth.uid()) = created_by
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), true) is false
  );

create policy "Permanent instructors can publish own diagnostics"
  on public.edusim_published_diagnostics
  for insert
  to authenticated
  with check (
    (select auth.uid()) = created_by
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), true) is false
  );

create policy "Permanent instructors can delete own diagnostics"
  on public.edusim_published_diagnostics
  for delete
  to authenticated
  using (
    (select auth.uid()) = created_by
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), true) is false
  );
