create table if not exists public.practice_focus (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.practice_focus enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.practice_focus to authenticated;
revoke all on table public.practice_focus from anon;

create policy "Users can read their own practice focus"
on public.practice_focus for select
using (auth.uid() = user_id);

create policy "Users can create their own practice focus"
on public.practice_focus for insert
with check (auth.uid() = user_id);

create policy "Users can update their own practice focus"
on public.practice_focus for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own practice focus"
on public.practice_focus for delete
using (auth.uid() = user_id);
