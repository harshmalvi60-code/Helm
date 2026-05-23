-- HELM — Supabase schema
-- Run inside the Supabase SQL editor on a fresh project.
-- All tables are protected by Row-Level Security so each user only ever sees their own data.

-- ============ EXTENSIONS ============
create extension if not exists "pgcrypto";

-- ============ ORGANIZATIONS ============
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  currency text default 'INR',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

-- ============ INTEGRATIONS / CONNECTIONS ============
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('shopify','meta','google','google-ads','klaviyo')),
  status text not null default 'pending' check (status in ('pending','connected','error','revoked')),
  account_label text,
  account_id text,
  scopes text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  last_synced_at timestamptz,
  connected_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, provider)
);
create index if not exists integrations_user_idx on public.integrations(user_id);

-- ============ ANALYTICS SNAPSHOTS ============
-- Daily aggregated metrics, one row per (user, source, date)
create table if not exists public.analytics_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  date date not null,
  revenue numeric default 0,
  ad_spend numeric default 0,
  sessions integer default 0,
  orders integer default 0,
  customers integer default 0,
  impressions integer default 0,
  clicks integer default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (user_id, source, date)
);
create index if not exists analytics_daily_user_date_idx on public.analytics_daily(user_id, date desc);

-- ============ CUSTOMERS (cohort + LTV) ============
create table if not exists public.customer_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text not null,
  source text not null default 'shopify',
  email text,
  first_order_at timestamptz,
  last_order_at timestamptz,
  total_orders integer default 0,
  total_spent numeric default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, source, external_id)
);
create index if not exists customer_user_idx on public.customer_records(user_id);

-- ============ AI INSIGHTS ============
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  severity text not null check (severity in ('critical','warning','opportunity','info')),
  title text not null,
  summary text,
  recommendation text,
  impact_inr numeric,
  metrics jsonb default '{}'::jsonb,
  status text default 'open' check (status in ('open','dismissed','snoozed','resolved')),
  snooze_until timestamptz,
  source_run_id uuid,
  created_at timestamptz default now()
);
create index if not exists insights_user_created_idx on public.insights(user_id, created_at desc);

-- ============ AI REPORTS ============
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'weekly',
  period_start date,
  period_end date,
  summary_md text,
  recommendations jsonb default '[]'::jsonb,
  metrics jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists reports_user_created_idx on public.reports(user_id, created_at desc);

-- ============ SUBSCRIPTIONS ============
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('starter','growth','scale')),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','canceled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  billing_provider text,
  external_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

-- ============ ALERTS PREFERENCES ============
create table if not exists public.alert_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  roas_drop_pct integer default 20,
  cvr_floor_pct numeric default 1.5,
  creative_fatigue boolean default true,
  weekly_report boolean default true,
  notification_channel text default 'email',
  slack_webhook text,
  updated_at timestamptz default now()
);

-- ============ AUDIT LOG ============
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ============ ROW-LEVEL SECURITY ============
alter table public.organizations    enable row level security;
alter table public.integrations     enable row level security;
alter table public.analytics_daily  enable row level security;
alter table public.customer_records enable row level security;
alter table public.insights         enable row level security;
alter table public.reports          enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.alert_settings   enable row level security;
alter table public.audit_log        enable row level security;

-- Policies: "user can only touch their own rows"
do $$
declare t text;
begin
  for t in select unnest(array[
    'organizations','integrations','analytics_daily','customer_records',
    'insights','reports','subscriptions','alert_settings','audit_log'
  ]) loop
    execute format('drop policy if exists %I_select on public.%I', t||'_select', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t||'_select', t);

    execute format('drop policy if exists %I_modify on public.%I', t||'_modify', t);
    execute format('create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t||'_modify', t);
  end loop;
end $$;

-- ============ HANDY VIEW: rolling 30d ============
create or replace view public.analytics_30d as
  select
    user_id,
    sum(revenue)    as revenue_30d,
    sum(ad_spend)   as ad_spend_30d,
    sum(orders)     as orders_30d,
    sum(sessions)   as sessions_30d,
    case when sum(ad_spend) > 0 then sum(revenue) / sum(ad_spend) else null end as roas_30d
  from public.analytics_daily
  where date >= current_date - interval '30 days'
  group by user_id;
