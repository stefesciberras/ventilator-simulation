create table if not exists public.teaching_prompts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.teaching_sessions(id) on delete cascade,
  instructor_id uuid not null,
  kind text not null check (kind in ('message', 'mcq', 'poll')),
  title text,
  body text not null check (char_length(body) between 1 and 4000),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists teaching_prompts_session_created_idx
  on public.teaching_prompts(session_id, created_at desc);

create table if not exists public.teaching_prompt_responses (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.teaching_prompts(id) on delete cascade,
  session_id uuid not null references public.teaching_sessions(id) on delete cascade,
  user_id uuid not null,
  option_id text not null,
  created_at timestamptz not null default now(),
  unique (prompt_id, user_id)
);

create index if not exists teaching_prompt_responses_session_prompt_idx
  on public.teaching_prompt_responses(session_id, prompt_id, created_at);

alter table public.teaching_prompts enable row level security;
alter table public.teaching_prompt_responses enable row level security;

grant select, insert, update, delete on public.teaching_prompts to authenticated;
grant select, insert on public.teaching_prompt_responses to authenticated;

create policy "Teaching session members can read prompts"
on public.teaching_prompts
for select
to authenticated
using (
  private.is_teaching_session_member(session_id)
  or private.is_teaching_session_instructor(session_id)
);

create policy "Instructor can create prompts"
on public.teaching_prompts
for insert
to authenticated
with check (
  instructor_id = (select auth.uid())
  and private.is_teaching_session_instructor(session_id)
);

create policy "Instructor can update prompts"
on public.teaching_prompts
for update
to authenticated
using (private.is_teaching_session_instructor(session_id))
with check (
  instructor_id = (select auth.uid())
  and private.is_teaching_session_instructor(session_id)
);

create policy "Instructor can delete prompts"
on public.teaching_prompts
for delete
to authenticated
using (private.is_teaching_session_instructor(session_id));

create policy "Candidate can read own response and instructor can read session responses"
on public.teaching_prompt_responses
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_teaching_session_instructor(session_id)
);

create policy "Candidate can submit one active prompt response"
on public.teaching_prompt_responses
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and private.is_teaching_session_member(session_id)
  and exists (
    select 1
    from public.teaching_prompts prompt
    where prompt.id = teaching_prompt_responses.prompt_id
      and prompt.session_id = teaching_prompt_responses.session_id
      and prompt.status = 'active'
      and prompt.kind in ('mcq', 'poll')
      and exists (
        select 1
        from jsonb_array_elements(prompt.options) option_value
        where option_value ->> 'id' = teaching_prompt_responses.option_id
      )
  )
);

do $$
begin
  alter publication supabase_realtime add table public.teaching_prompts;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.teaching_prompt_responses;
exception when duplicate_object then null;
end $$;
