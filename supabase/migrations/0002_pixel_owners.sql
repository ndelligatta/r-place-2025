create table if not exists public.pixel_owners (
  board_id int not null,
  idx int not null,
  owner text,
  color_idx int,
  updated_at timestamptz default now(),
  primary key (board_id, idx)
);

alter table public.pixel_owners enable row level security;

drop policy if exists "read owners" on public.pixel_owners;
create policy "read owners" on public.pixel_owners for select using (true);

drop policy if exists "write owners" on public.pixel_owners;
create policy "write owners" on public.pixel_owners for insert with check (true);

drop policy if exists "update owners" on public.pixel_owners;
create policy "update owners" on public.pixel_owners for update using (true) with check (true);
