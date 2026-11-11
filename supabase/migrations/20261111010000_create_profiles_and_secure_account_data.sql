create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_url text,
  avatar_path text,
  price_alert_emails_enabled boolean not null default true,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;

drop policy if exists "CartDrop profile owner boundary" on public.profiles;
create policy "CartDrop profile owner boundary"
  on public.profiles as restrictive for all to public
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "CartDrop users can read their profile" on public.profiles;
create policy "CartDrop users can read their profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "CartDrop users can create their profile" on public.profiles;
create policy "CartDrop users can create their profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "CartDrop users can update their profile" on public.profiles;
create policy "CartDrop users can update their profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.cartdrop_create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, terms_accepted_at)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120),
    new.raw_user_meta_data ->> 'avatar_url',
    case when new.raw_user_meta_data ->> 'terms_accepted' = 'true' then timezone('utc', now()) else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.cartdrop_create_profile_for_user() from public, anon, authenticated;

drop trigger if exists cartdrop_create_profile_after_signup on auth.users;
create trigger cartdrop_create_profile_after_signup
  after insert on auth.users
  for each row execute function public.cartdrop_create_profile_for_user();

insert into public.profiles (id, full_name, avatar_url)
select
  users.id,
  left(coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name', ''), 120),
  users.raw_user_meta_data ->> 'avatar_url'
from auth.users as users
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "CartDrop avatar public read" on storage.objects;
create policy "CartDrop avatar public read"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

drop policy if exists "CartDrop avatar owner upload" on storage.objects;
create policy "CartDrop avatar owner upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "CartDrop avatar owner update" on storage.objects;
create policy "CartDrop avatar owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "CartDrop avatar owner delete" on storage.objects;
create policy "CartDrop avatar owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

alter table public.price_alerts enable row level security;
alter table public.price_alert_events enable row level security;

drop policy if exists "CartDrop price alert owner boundary" on public.price_alerts;
create policy "CartDrop price alert owner boundary"
  on public.price_alerts as restrictive for all to public
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.products as product
      where product.id = price_alerts.product_id
        and product.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.products as product
      where product.id = price_alerts.product_id
        and product.user_id = (select auth.uid())
    )
  );

drop policy if exists "CartDrop price alert event owner boundary" on public.price_alert_events;
create policy "CartDrop price alert event owner boundary"
  on public.price_alert_events as restrictive for all to public
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.products as product
      where product.id = price_alert_events.product_id
        and product.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.products as product
      where product.id = price_alert_events.product_id
        and product.user_id = (select auth.uid())
    )
  );
