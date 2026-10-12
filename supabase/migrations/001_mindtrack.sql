create extension if not exists pgcrypto;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  safe_mode boolean not null default true,
  auto_sync boolean not null default false,
  carrier_tracking_enabled boolean not null default false,
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_number text not null,
  product_name text not null default 'Nike Mind 001',
  status text not null default 'order_received' check (status in ('order_received','processing','shipped','partially_shipped','in_transit','out_for_delivery','delivered','unknown')),
  order_placed_at timestamptz,
  order_url text,
  carrier text,
  tracking_number text,
  estimated_delivery date,
  prediction_confidence text,
  last_carrier_scan timestamptz,
  last_sync_at timestamptz,
  source_message_ids text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique(user_id, order_number)
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  carrier text,
  tracking_number text not null,
  status text not null default 'unknown',
  estimated_delivery date,
  last_scan_at timestamptz,
  tracking_url text,
  updated_at timestamptz not null default now(),
  unique(user_id, order_id, tracking_number)
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  shipment_id uuid references public.shipments(id) on delete cascade,
  title text not null,
  description text,
  status text,
  occurred_at timestamptz,
  source text not null default 'email',
  source_message_id text,
  created_at timestamptz not null default now(),
  unique(user_id, order_id, source, source_message_id, title, occurred_at)
);

create table if not exists public.gmail_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text,
  encrypted_refresh_token text not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
alter table public.orders enable row level security;
alter table public.shipments enable row level security;
alter table public.order_events enable row level security;
alter table public.gmail_connections enable row level security;
alter table public.oauth_states enable row level security;

create policy "own settings read" on public.user_settings for select to authenticated using (auth.uid() = user_id);
create policy "own settings insert" on public.user_settings for insert to authenticated with check (auth.uid() = user_id);
create policy "own settings update" on public.user_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own orders read" on public.orders for select to authenticated using (auth.uid() = user_id);
create policy "own shipments read" on public.shipments for select to authenticated using (auth.uid() = user_id);
create policy "own events read" on public.order_events for select to authenticated using (auth.uid() = user_id);
-- Provider tokens and OAuth states are service-role-only. No client policy is created for those tables.
grant select, insert, update on public.user_settings to authenticated;
grant select on public.orders, public.shipments, public.order_events to authenticated;
