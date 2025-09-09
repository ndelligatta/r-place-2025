-- Create a fresh board #2 at 64x64
insert into public.boards (id, data, size)
values (2, '', 64)
on conflict (id) do update set size = excluded.size;

