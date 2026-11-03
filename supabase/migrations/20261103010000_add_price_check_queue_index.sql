create index if not exists products_last_checked_at_id_idx
  on public.products (last_checked_at asc nulls first, id asc);
