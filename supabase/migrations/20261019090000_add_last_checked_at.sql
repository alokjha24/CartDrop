alter table public.products
  add column if not exists last_checked_at timestamptz;

update public.products
set last_checked_at = coalesce(last_checked_at, updated_at)
where last_checked_at is null;
