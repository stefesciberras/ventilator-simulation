create index if not exists edusim_organisations_created_by_idx
  on public.edusim_organisations (created_by);

create index if not exists edusim_org_invitations_invited_by_idx
  on public.edusim_organisation_invitations (invited_by);

create index if not exists edusim_org_invitations_accepted_by_idx
  on public.edusim_organisation_invitations (accepted_by)
  where accepted_by is not null;

create index if not exists edusim_profiles_created_by_idx
  on public.edusim_profiles (created_by)
  where created_by is not null;

create index if not exists edusim_profiles_legacy_instructor_idx
  on public.edusim_profiles (instructor_id)
  where instructor_id is not null;
