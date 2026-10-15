create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  alert_type text not null check (alert_type in ('target_price', 'percentage_drop', 'lowest_price')),
  threshold numeric(12, 2),
  frequency text not null default 'immediate'
    check (frequency in ('immediate', 'daily', 'weekly')),
  observation_window_days integer
    check (observation_window_days is null or observation_window_days in (30, 90)),
  baseline_price numeric(12, 2),
  enabled boolean not null default true,
  last_triggered_at timestamptz,
  last_triggered_price numeric(12, 2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint price_alerts_threshold_positive check (
    threshold is null or threshold > 0
  ),
  constraint price_alerts_baseline_positive check (
    baseline_price is null or baseline_price > 0
  ),
  constraint price_alerts_type_values check (
    (alert_type = 'target_price' and threshold is not null and observation_window_days is null)
    or (alert_type = 'percentage_drop' and threshold > 0 and threshold <= 100 and observation_window_days is null)
    or (alert_type = 'lowest_price' and threshold is null and observation_window_days is not null)
  )
);

create unique index if not exists price_alerts_user_product_type_idx
  on public.price_alerts (user_id, product_id, alert_type);

create table if not exists public.price_alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  alert_id uuid not null references public.price_alerts(id) on delete cascade,
  alert_type text not null check (alert_type in ('target_price', 'percentage_drop', 'lowest_price')),
  triggering_price numeric(12, 2) not null check (triggering_price > 0),
  previous_price numeric(12, 2),
  triggered_at timestamptz not null default timezone('utc', now()),
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'recorded', 'failed')),
  read_at timestamptz,
  event_key text not null unique
);

create index if not exists price_alerts_product_enabled_idx
  on public.price_alerts (product_id, enabled);

create index if not exists price_alert_events_user_triggered_idx
  on public.price_alert_events (user_id, triggered_at desc);

alter table public.price_alerts enable row level security;
alter table public.price_alert_events enable row level security;

drop policy if exists "Users can view their own price alerts" on public.price_alerts;
create policy "Users can view their own price alerts"
  on public.price_alerts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own price alerts" on public.price_alerts;
create policy "Users can create their own price alerts"
  on public.price_alerts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own price alerts" on public.price_alerts;
create policy "Users can update their own price alerts"
  on public.price_alerts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own price alerts" on public.price_alerts;
create policy "Users can delete their own price alerts"
  on public.price_alerts for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own price alert events" on public.price_alert_events;
create policy "Users can view their own price alert events"
  on public.price_alert_events for select
  using (auth.uid() = user_id);
