alter table public.edusim_action_definitions
  add column if not exists setting text not null default 'ana'
  check (setting in ('ana','itu','all'));

update public.edusim_action_definitions
set setting = case
  when environments @> array['edumon-ana']::text[] and environments @> array['edumon-icu']::text[] then 'all'
  when environments @> array['edumon-icu']::text[] then 'itu'
  else 'ana'
end;
