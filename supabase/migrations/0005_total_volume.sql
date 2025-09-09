create table if not exists public.total_volume (
  id bigserial primary key,
  volume numeric,
  fees numeric,
  updated_at timestamptz default now()
);

alter table public.total_volume enable row level security;

drop policy if exists "read total_volume" on public.total_volume;
create policy "read total_volume" on public.total_volume for select using (true);

drop policy if exists "write total_volume" on public.total_volume;
create policy "write total_volume" on public.total_volume for insert with check (true);

drop policy if exists "update total_volume" on public.total_volume;
create policy "update total_volume" on public.total_volume for update using (true) with check (true);

