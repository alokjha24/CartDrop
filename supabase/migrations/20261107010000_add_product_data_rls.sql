alter table public.products enable row level security;
alter table public.price_history enable row level security;

revoke all on table public.products from anon, authenticated;
revoke all on table public.price_history from anon, authenticated;

grant select, insert, update, delete on table public.products to authenticated;
grant select, insert on table public.price_history to authenticated;

-- Restrictive policies keep any existing permissive policies owner-scoped.
drop policy if exists "CartDrop product owner boundary" on public.products;
create policy "CartDrop product owner boundary"
  on public.products as restrictive for all to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "CartDrop users can read their own products" on public.products;
create policy "CartDrop users can read their own products"
  on public.products for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "CartDrop users can insert their own products" on public.products;
create policy "CartDrop users can insert their own products"
  on public.products for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "CartDrop users can update their own products" on public.products;
create policy "CartDrop users can update their own products"
  on public.products for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "CartDrop users can delete their own products" on public.products;
create policy "CartDrop users can delete their own products"
  on public.products for delete to authenticated
  using ((select auth.uid()) = user_id);

-- History rows inherit ownership from their parent product.
drop policy if exists "CartDrop price history owner boundary" on public.price_history;
create policy "CartDrop price history owner boundary"
  on public.price_history as restrictive for all to public
  using (
    exists (
      select 1
      from public.products as product
      where product.id = price_history.product_id
        and product.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.products as product
      where product.id = price_history.product_id
        and product.user_id = (select auth.uid())
    )
  );

drop policy if exists "CartDrop users can read their own price history" on public.price_history;
create policy "CartDrop users can read their own price history"
  on public.price_history for select to authenticated
  using (
    exists (
      select 1
      from public.products as product
      where product.id = price_history.product_id
        and product.user_id = (select auth.uid())
    )
  );

drop policy if exists "CartDrop users can insert price history for their own products" on public.price_history;
create policy "CartDrop users can insert price history for their own products"
  on public.price_history for insert to authenticated
  with check (
    exists (
      select 1
      from public.products as product
      where product.id = price_history.product_id
        and product.user_id = (select auth.uid())
    )
  );
