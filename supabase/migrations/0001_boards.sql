create table if not exists public.boards (
  id int primary key,
  data text not null
);

alter table public.boards enable row level security;
create policy if not exists "read board" on public.boards for select using (true);
create policy if not exists "write board" on public.boards for insert with check (true);
create policy if not exists "update board" on public.boards for update using (true) with check (true);

insert into public.boards (id, data)
  values (1, '')
  on conflict (id) do nothing;
