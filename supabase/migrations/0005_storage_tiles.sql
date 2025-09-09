-- Create a public Storage bucket `tiles` and open basic RLS for anon
-- Safe to run multiple times

-- Create bucket (public)
do $$ begin
  perform storage.create_bucket('tiles', true, null, null);
exception when others then
  -- bucket may already exist
  null;
end $$;

-- Ensure bucket is public (idempotent)
do $$ begin
  perform storage.update_bucket('tiles', true, null, null);
exception when others then
  null;
end $$;

-- Policies on storage.objects scoped to the tiles bucket
drop policy if exists "tiles select" on storage.objects;
create policy "tiles select" on storage.objects for select using (bucket_id = 'tiles');

drop policy if exists "tiles insert" on storage.objects;
create policy "tiles insert" on storage.objects for insert with check (bucket_id = 'tiles');

drop policy if exists "tiles update" on storage.objects;
create policy "tiles update" on storage.objects for update using (bucket_id = 'tiles') with check (bucket_id = 'tiles');
