insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Users can view product images" on storage.objects;
create policy "Users can view product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "Users can upload product images" on storage.objects;
create policy "Users can upload product images"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can update product images" on storage.objects;
create policy "Users can update product images"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
