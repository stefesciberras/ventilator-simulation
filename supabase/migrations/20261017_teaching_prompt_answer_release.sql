alter table public.teaching_prompts
  add column if not exists answer_released_at timestamptz,
  add column if not exists released_correct_option_id text;

create table if not exists public.teaching_prompt_answer_keys (
  prompt_id uuid primary key references public.teaching_prompts(id) on delete cascade,
  session_id uuid not null references public.teaching_sessions(id) on delete cascade,
  instructor_id uuid not null,
  correct_option_id text not null,
  explanation text,
  created_at timestamptz not null default now()
);

create index if not exists teaching_prompt_answer_keys_session_idx
  on public.teaching_prompt_answer_keys(session_id, created_at desc);

alter table public.teaching_prompt_answer_keys enable row level security;

grant select, insert, update, delete on public.teaching_prompt_answer_keys to authenticated;

drop policy if exists "Instructor can read prompt answer keys" on public.teaching_prompt_answer_keys;
create policy "Instructor can read prompt answer keys"
on public.teaching_prompt_answer_keys for select
to authenticated
using (private.is_teaching_session_instructor(session_id));

drop policy if exists "Instructor can create prompt answer keys" on public.teaching_prompt_answer_keys;
create policy "Instructor can create prompt answer keys"
on public.teaching_prompt_answer_keys for insert
to authenticated
with check (
  instructor_id = (select auth.uid())
  and private.is_teaching_session_instructor(session_id)
);

drop policy if exists "Instructor can update prompt answer keys" on public.teaching_prompt_answer_keys;
create policy "Instructor can update prompt answer keys"
on public.teaching_prompt_answer_keys for update
to authenticated
using (private.is_teaching_session_instructor(session_id))
with check (
  instructor_id = (select auth.uid())
  and private.is_teaching_session_instructor(session_id)
);

drop policy if exists "Instructor can delete prompt answer keys" on public.teaching_prompt_answer_keys;
create policy "Instructor can delete prompt answer keys"
on public.teaching_prompt_answer_keys for delete
to authenticated
using (private.is_teaching_session_instructor(session_id));
