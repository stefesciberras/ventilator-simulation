alter table public.instructor_presets
  add column if not exists product text not null default 'eduvent';

alter table public.instructor_presets
  drop constraint if exists instructor_presets_product_check;

alter table public.instructor_presets
  add constraint instructor_presets_product_check
  check (product in ('eduvent', 'edumon-ana', 'edumon-icu'));

drop index if exists public.instructor_presets_owner_name_key;

create unique index if not exists instructor_presets_owner_product_name_key
  on public.instructor_presets (instructor_id, product, lower(trim(name)));

create index if not exists instructor_presets_owner_product_updated_idx
  on public.instructor_presets (instructor_id, product, updated_at desc);

comment on column public.instructor_presets.product is
  'EDUSIM product that owns the scenario: eduvent, edumon-ana, or edumon-icu.';
