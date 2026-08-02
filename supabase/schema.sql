create extension if not exists pgcrypto;

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_date date not null default current_date,
  feeling text not null default '',
  clicked text not null default '',
  correction text not null default '',
  next_practice text not null default '',
  memory text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journal_entries enable row level security;

create policy "Users can read their own entries"
on public.journal_entries for select
using (auth.uid() = user_id);

create policy "Users can create their own entries"
on public.journal_entries for insert
with check (auth.uid() = user_id);

create policy "Users can update their own entries"
on public.journal_entries for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own entries"
on public.journal_entries for delete
using (auth.uid() = user_id);
