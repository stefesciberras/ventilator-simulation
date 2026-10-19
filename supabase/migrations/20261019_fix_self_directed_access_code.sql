create or replace function public.make_self_directed_access_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));
    exit when not exists (
      select 1 from public.self_directed_assignments where access_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

revoke all on function public.make_self_directed_access_code() from public;
