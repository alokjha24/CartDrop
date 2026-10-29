alter table public.products
  add column if not exists is_favorite boolean not null default false;
