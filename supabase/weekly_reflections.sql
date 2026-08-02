create table if not exists public.weekly_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  title text not null,
  opening text not null,
  observation text not null,
  carry_forward text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_reflections enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.weekly_reflections to authenticated;
revoke all on table public.weekly_reflections from anon;

create policy "Users can read their own weekly reflections"
on public.weekly_reflections for select
using (auth.uid() = user_id);

create policy "Users can create their own weekly reflections"
on public.weekly_reflections for insert
with check (auth.uid() = user_id);

create policy "Users can update their own weekly reflections"
on public.weekly_reflections for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own weekly reflections"
on public.weekly_reflections for delete
using (auth.uid() = user_id);
