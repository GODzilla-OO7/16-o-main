-- Season mode saves (one active season per signed-in user)
create table if not exists public.season_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.season_saves enable row level security;
drop policy if exists "own season" on public.season_saves;
create policy "own season" on public.season_saves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
