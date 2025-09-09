-- Set board 1 to 64x64. The frontend will reconcile board data length on load.
update public.boards set size = 64 where id = 1;

