alter table public.teaching_library_items
  add column if not exists environments text[] not null default array['all']::text[];

alter table public.case_media
  add column if not exists environments text[] not null default array['all']::text[];

update public.teaching_library_items
set environments = array['all']::text[]
where environments is null or cardinality(environments) = 0;

update public.case_media
set environments = array['all']::text[]
where environments is null or cardinality(environments) = 0;

create index if not exists teaching_library_items_environments_gin
  on public.teaching_library_items using gin (environments);

create index if not exists case_media_environments_gin
  on public.case_media using gin (environments);
