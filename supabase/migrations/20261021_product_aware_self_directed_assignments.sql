-- Product-aware self-directed assignments keep the existing immutable scenario JSONB
-- column, but store new assignments as { envelopeVersion, product, scenario }.
-- Legacy raw EDUVENT snapshots remain valid and resolve to eduvent.

create or replace function public.resolve_self_directed_assignment_product(p_access_code text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  assignment_scenario jsonb;
  resolved_product text;
begin
  select scenario into assignment_scenario
  from public.self_directed_assignments
  where access_code = upper(regexp_replace(coalesce(p_access_code,''), '[^A-Za-z0-9]', '', 'g'))
    and status = 'active'
    and expires_at > now()
  limit 1;

  if assignment_scenario is null then
    raise exception 'Self-directed session not found or expired';
  end if;

  resolved_product := coalesce(assignment_scenario ->> 'product', 'eduvent');
  if resolved_product not in ('eduvent', 'edumon-ana', 'edumon-icu') then
    resolved_product := 'eduvent';
  end if;
  return resolved_product;
end;
$$;

revoke all on function public.resolve_self_directed_assignment_product(text) from public;
grant execute on function public.resolve_self_directed_assignment_product(text) to anon, authenticated;
