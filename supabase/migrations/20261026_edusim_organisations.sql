create schema if not exists private;

create table if not exists public.edusim_organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.edusim_organisation_members (
  organisation_id uuid not null references public.edusim_organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'instructor')),
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

create index if not exists edusim_organisation_members_user_idx
  on public.edusim_organisation_members (user_id, organisation_id);

create table if not exists public.edusim_organisation_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.edusim_organisations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'instructor')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists edusim_org_invitation_pending_email_idx
  on public.edusim_organisation_invitations (organisation_id, lower(email))
  where status = 'pending';

create or replace function private.edusim_is_permanent_user()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false
$$;

create or replace function private.edusim_organisation_role(p_organisation_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.edusim_organisation_members m
  where m.organisation_id = p_organisation_id
    and m.user_id = (select auth.uid())
  limit 1
$$;

create or replace function private.edusim_is_organisation_member(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.edusim_organisation_members m
    where m.organisation_id = p_organisation_id
      and m.user_id = (select auth.uid())
  )
$$;

revoke all on function private.edusim_organisation_role(uuid) from public;
revoke all on function private.edusim_is_organisation_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.edusim_organisation_role(uuid) to authenticated;
grant execute on function private.edusim_is_organisation_member(uuid) to authenticated;
grant execute on function private.edusim_is_permanent_user() to authenticated;

create or replace function private.edusim_fill_organisation_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select u.email into new.email from auth.users u where u.id = new.user_id;
  if new.email is null then
    raise exception 'Organisation members require an email account';
  end if;
  return new;
end;
$$;

create or replace function private.edusim_add_organisation_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.edusim_organisation_members (organisation_id, user_id, email, role)
  select new.id, new.created_by, coalesce(u.email, ''), 'owner'
  from auth.users u where u.id = new.created_by;
  return new;
end;
$$;

drop trigger if exists edusim_fill_organisation_member_email on public.edusim_organisation_members;
create trigger edusim_fill_organisation_member_email
before insert or update of user_id on public.edusim_organisation_members
for each row execute function private.edusim_fill_organisation_member_email();

drop trigger if exists edusim_add_organisation_owner on public.edusim_organisations;
create trigger edusim_add_organisation_owner
after insert on public.edusim_organisations
for each row execute function private.edusim_add_organisation_owner();

alter table public.edusim_organisations enable row level security;
alter table public.edusim_organisation_members enable row level security;
alter table public.edusim_organisation_invitations enable row level security;

revoke all on public.edusim_organisations from anon, authenticated;
revoke all on public.edusim_organisation_members from anon, authenticated;
revoke all on public.edusim_organisation_invitations from anon, authenticated;
grant select, insert, update, delete on public.edusim_organisations to authenticated;
grant select, insert, update, delete on public.edusim_organisation_members to authenticated;
grant select, insert, update, delete on public.edusim_organisation_invitations to authenticated;

create policy edusim_organisations_select_member
on public.edusim_organisations for select to authenticated
using (
  (select private.edusim_is_permanent_user())
  and (created_by = (select auth.uid()) or (select private.edusim_is_organisation_member(id)))
);

create policy edusim_organisations_insert_owner
on public.edusim_organisations for insert to authenticated
with check (
  (select private.edusim_is_permanent_user())
  and created_by = (select auth.uid())
);

create policy edusim_organisations_update_admin
on public.edusim_organisations for update to authenticated
using (
  (select private.edusim_is_permanent_user())
  and (select private.edusim_organisation_role(id)) in ('owner', 'admin')
)
with check (
  (select private.edusim_is_permanent_user())
  and (select private.edusim_organisation_role(id)) in ('owner', 'admin')
);

create policy edusim_organisations_delete_owner
on public.edusim_organisations for delete to authenticated
using (
  (select private.edusim_is_permanent_user())
  and (select private.edusim_organisation_role(id)) = 'owner'
);

create policy edusim_org_members_select_member
on public.edusim_organisation_members for select to authenticated
using (
  (select private.edusim_is_permanent_user())
  and (select private.edusim_is_organisation_member(organisation_id))
);

create policy edusim_org_members_accept_invitation
on public.edusim_organisation_members for insert to authenticated
with check (
  (select private.edusim_is_permanent_user())
  and user_id = (select auth.uid())
  and role in ('admin', 'instructor')
  and exists (
    select 1
    from public.edusim_organisation_invitations i
    where i.organisation_id = organisation_id
      and lower(i.email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
      and i.role = role
      and i.status = 'pending'
  )
);

create policy edusim_org_members_update_owner
on public.edusim_organisation_members for update to authenticated
using (
  (select private.edusim_is_permanent_user())
  and (select private.edusim_organisation_role(organisation_id)) = 'owner'
  and role <> 'owner'
)
with check (
  (select private.edusim_is_permanent_user())
  and (select private.edusim_organisation_role(organisation_id)) = 'owner'
  and role in ('admin', 'instructor')
);

create policy edusim_org_members_delete_manager
on public.edusim_organisation_members for delete to authenticated
using (
  (select private.edusim_is_permanent_user())
  and role <> 'owner'
  and (
    (select private.edusim_organisation_role(organisation_id)) = 'owner'
    or (
      (select private.edusim_organisation_role(organisation_id)) = 'admin'
      and role = 'instructor'
    )
    or user_id = (select auth.uid())
  )
);

create policy edusim_org_invitations_select
on public.edusim_organisation_invitations for select to authenticated
using (
  (select private.edusim_is_permanent_user())
  and (
    (select private.edusim_is_organisation_member(organisation_id))
    or lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  )
);

create policy edusim_org_invitations_insert_manager
on public.edusim_organisation_invitations for insert to authenticated
with check (
  (select private.edusim_is_permanent_user())
  and invited_by = (select auth.uid())
  and (select private.edusim_organisation_role(organisation_id)) in ('owner', 'admin')
  and role in ('admin', 'instructor')
);

create policy edusim_org_invitations_update
on public.edusim_organisation_invitations for update to authenticated
using (
  (select private.edusim_is_permanent_user())
  and (
    (select private.edusim_organisation_role(organisation_id)) in ('owner', 'admin')
    or (lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', '')) and status = 'pending')
  )
)
with check (
  (select private.edusim_is_permanent_user())
  and (
    (select private.edusim_organisation_role(organisation_id)) in ('owner', 'admin')
    or (
      lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
      and status = 'accepted'
      and accepted_by = (select auth.uid())
    )
  )
);

create policy edusim_org_invitations_delete_manager
on public.edusim_organisation_invitations for delete to authenticated
using (
  (select private.edusim_is_permanent_user())
  and (select private.edusim_organisation_role(organisation_id)) in ('owner', 'admin')
);

alter table public.edusim_profiles
  add column if not exists owner_type text,
  add column if not exists organisation_id uuid references public.edusim_organisations(id) on delete cascade,
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.edusim_profiles
set owner_type = coalesce(owner_type, 'user'),
    owner_user_id = coalesce(owner_user_id, instructor_id),
    created_by = coalesce(created_by, instructor_id)
where owner_type is null or owner_user_id is null or created_by is null;

alter table public.edusim_profiles alter column owner_type set default 'user';
alter table public.edusim_profiles alter column owner_type set not null;
alter table public.edusim_profiles alter column instructor_id drop not null;

alter table public.edusim_profiles drop constraint if exists edusim_profiles_owner_type_check;
alter table public.edusim_profiles add constraint edusim_profiles_owner_type_check
  check (owner_type in ('user', 'organisation'));

alter table public.edusim_profiles drop constraint if exists edusim_profiles_owner_shape_check;
alter table public.edusim_profiles add constraint edusim_profiles_owner_shape_check
  check (
    (owner_type = 'user' and owner_user_id is not null and organisation_id is null)
    or
    (owner_type = 'organisation' and organisation_id is not null and owner_user_id is null)
  );

drop index if exists public.edusim_profiles_owner_product_name_idx;
drop index if exists public.edusim_profiles_owner_product_base_idx;

create unique index if not exists edusim_profiles_user_product_name_idx
  on public.edusim_profiles (owner_user_id, product, lower(name))
  where owner_type = 'user';
create unique index if not exists edusim_profiles_org_product_name_idx
  on public.edusim_profiles (organisation_id, product, lower(name))
  where owner_type = 'organisation';
create unique index if not exists edusim_profiles_user_product_base_idx
  on public.edusim_profiles (owner_user_id, product, base_key)
  where owner_type = 'user' and base_key is not null;
create unique index if not exists edusim_profiles_org_product_base_idx
  on public.edusim_profiles (organisation_id, product, base_key)
  where owner_type = 'organisation' and base_key is not null;

create index if not exists edusim_profiles_organisation_idx
  on public.edusim_profiles (organisation_id, product)
  where owner_type = 'organisation';

alter table public.edusim_profiles enable row level security;
revoke all on public.edusim_profiles from anon, authenticated;
grant select, insert, update, delete on public.edusim_profiles to authenticated;

drop policy if exists edusim_profiles_select_own on public.edusim_profiles;
drop policy if exists edusim_profiles_insert_own on public.edusim_profiles;
drop policy if exists edusim_profiles_update_own on public.edusim_profiles;
drop policy if exists edusim_profiles_delete_own on public.edusim_profiles;

create policy edusim_profiles_select_scope
on public.edusim_profiles for select to authenticated
using (
  (select private.edusim_is_permanent_user())
  and (
    (owner_type = 'user' and owner_user_id = (select auth.uid()))
    or
    (owner_type = 'organisation' and (select private.edusim_is_organisation_member(organisation_id)))
  )
);

create policy edusim_profiles_insert_scope
on public.edusim_profiles for insert to authenticated
with check (
  (select private.edusim_is_permanent_user())
  and created_by = (select auth.uid())
  and (
    (owner_type = 'user' and owner_user_id = (select auth.uid()) and organisation_id is null)
    or
    (owner_type = 'organisation' and owner_user_id is null and (select private.edusim_organisation_role(organisation_id)) in ('owner', 'admin'))
  )
);

create policy edusim_profiles_update_scope
on public.edusim_profiles for update to authenticated
using (
  (select private.edusim_is_permanent_user())
  and (
    (owner_type = 'user' and owner_user_id = (select auth.uid()))
    or
    (owner_type = 'organisation' and (select private.edusim_organisation_role(organisation_id)) in ('owner', 'admin'))
  )
)
with check (
  (select private.edusim_is_permanent_user())
  and (
    (owner_type = 'user' and owner_user_id = (select auth.uid()) and organisation_id is null)
    or
    (owner_type = 'organisation' and owner_user_id is null and (select private.edusim_organisation_role(organisation_id)) in ('owner', 'admin'))
  )
);

create policy edusim_profiles_delete_scope
on public.edusim_profiles for delete to authenticated
using (
  (select private.edusim_is_permanent_user())
  and (
    (owner_type = 'user' and owner_user_id = (select auth.uid()))
    or
    (owner_type = 'organisation' and (select private.edusim_organisation_role(organisation_id)) in ('owner', 'admin'))
  )
);
