-- Add a size column to boards so the frontend can determine grid dimensions dynamically
alter table public.boards add column if not exists size int;

-- Initialize default size for existing board 1 if null
update public.boards set size = coalesce(size, 32) where id = 1;

