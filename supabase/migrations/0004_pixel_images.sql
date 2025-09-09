create table if not exists public.pixel_images (
  board_id int not null,
  idx int not null,
  path text not null,
  owner text,
  updated_at timestamptz default now(),
  primary key (board_id, idx)
);

alter table public.pixel_images enable row level security;
drop policy if exists "read pixel_images" on public.pixel_images;
create policy "read pixel_images" on public.pixel_images for select using (true);
drop policy if exists "write pixel_images" on public.pixel_images;
create policy "write pixel_images" on public.pixel_images for insert with check (true);
drop policy if exists "update pixel_images" on public.pixel_images;
create policy "update pixel_images" on public.pixel_images for update using (true) with check (true);

alter table public.boards add column if not exists images_json text;

