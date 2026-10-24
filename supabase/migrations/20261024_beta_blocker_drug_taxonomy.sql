-- Keep Beta blocker in Drugs > Cardiovascular. This is a data taxonomy correction only.
update public.edusim_action_definitions
set kind = 'drug',
    updated_at = now()
where id = 'beta-blocker';
