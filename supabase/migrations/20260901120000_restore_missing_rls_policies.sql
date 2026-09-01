-- Repair migration: the initial schema migration only partially applied on
-- the remote database. Tables campaigns, example-provider-call-id, follow_ups, and
-- activities were missing entirely, and RLS was enabled on customers/calls
-- with zero policies (silently denying all reads/writes). Recreate
-- everything idempotently.

create extension if not exists "pgcrypto";

-- CAMPAIGNS
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'completed')),
  objective text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CALL OUTCOMES
create table if not exists public.example-provider-call-id (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.calls(id) on delete cascade,
  outcome text not null,
  summary text,
  sentiment text check (
    sentiment is null or sentiment in ('positive','neutral','negative','mixed')
  ),
  actionable boolean not null default false,
  action_required text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FOLLOW-UPS
create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  call_id uuid references public.calls(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending','completed','cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ACTIVITIES
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  call_id uuid references public.calls(id) on delete cascade,
  follow_up_id uuid references public.follow_ups(id) on delete cascade,
  activity_type text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Add campaign_id to calls if missing (depends on campaigns existing)
alter table public.calls add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

-- INDEXES
create index if not exists customers_owner_id_idx on public.customers(owner_id);
create index if not exists customers_phone_idx on public.customers(phone);
create index if not exists campaigns_owner_id_idx on public.campaigns(owner_id);
create index if not exists campaigns_status_idx on public.campaigns(status);
create index if not exists calls_owner_id_idx on public.calls(owner_id);
create index if not exists calls_customer_id_idx on public.calls(customer_id);
create index if not exists calls_campaign_id_idx on public.calls(campaign_id);
create index if not exists calls_provider_call_id_idx on public.calls(provider_call_id);
create index if not exists calls_status_idx on public.calls(status);
create index if not exists follow_ups_owner_id_idx on public.follow_ups(owner_id);
create index if not exists follow_ups_customer_id_idx on public.follow_ups(customer_id);
create index if not exists follow_ups_status_idx on public.follow_ups(status);
create index if not exists activities_owner_id_idx on public.activities(owner_id);
create index if not exists activities_created_at_idx on public.activities(created_at desc);

-- ROW LEVEL SECURITY
alter table public.customers enable row level security;
alter table public.campaigns enable row level security;
alter table public.calls enable row level security;
alter table public.example-provider-call-id enable row level security;
alter table public.follow_ups enable row level security;
alter table public.activities enable row level security;

drop policy if exists "Users can view their own customers" on public.customers;
drop policy if exists "Users can create their own customers" on public.customers;
drop policy if exists "Users can update their own customers" on public.customers;
drop policy if exists "Users can delete their own customers" on public.customers;

create policy "Users can view their own customers"
  on public.customers for select using (auth.uid() = owner_id);
create policy "Users can create their own customers"
  on public.customers for insert with check (auth.uid() = owner_id);
create policy "Users can update their own customers"
  on public.customers for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users can delete their own customers"
  on public.customers for delete using (auth.uid() = owner_id);

drop policy if exists "Users can view their own campaigns" on public.campaigns;
drop policy if exists "Users can create their own campaigns" on public.campaigns;
drop policy if exists "Users can update their own campaigns" on public.campaigns;
drop policy if exists "Users can delete their own campaigns" on public.campaigns;

create policy "Users can view their own campaigns"
  on public.campaigns for select using (auth.uid() = owner_id);
create policy "Users can create their own campaigns"
  on public.campaigns for insert with check (auth.uid() = owner_id);
create policy "Users can update their own campaigns"
  on public.campaigns for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users can delete their own campaigns"
  on public.campaigns for delete using (auth.uid() = owner_id);

drop policy if exists "Users can view their own calls" on public.calls;
drop policy if exists "Users can create their own calls" on public.calls;
drop policy if exists "Users can update their own calls" on public.calls;

create policy "Users can view their own calls"
  on public.calls for select using (auth.uid() = owner_id);
create policy "Users can create their own calls"
  on public.calls for insert with check (auth.uid() = owner_id);
create policy "Users can update their own calls"
  on public.calls for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Users can view outcomes for their calls" on public.example-provider-call-id;
drop policy if exists "Users can create outcomes for their calls" on public.example-provider-call-id;
drop policy if exists "Users can update outcomes for their calls" on public.example-provider-call-id;

create policy "Users can view outcomes for their calls"
  on public.example-provider-call-id for select
  using (exists (
    select 1 from public.calls
    where calls.id = example-provider-call-id.call_id and calls.owner_id = auth.uid()
  ));
create policy "Users can create outcomes for their calls"
  on public.example-provider-call-id for insert
  with check (exists (
    select 1 from public.calls
    where calls.id = example-provider-call-id.call_id and calls.owner_id = auth.uid()
  ));
create policy "Users can update outcomes for their calls"
  on public.example-provider-call-id for update
  using (exists (
    select 1 from public.calls
    where calls.id = example-provider-call-id.call_id and calls.owner_id = auth.uid()
  ));

drop policy if exists "Users can view their own follow ups" on public.follow_ups;
drop policy if exists "Users can create their own follow ups" on public.follow_ups;
drop policy if exists "Users can update their own follow ups" on public.follow_ups;
drop policy if exists "Users can delete their own follow ups" on public.follow_ups;

create policy "Users can view their own follow ups"
  on public.follow_ups for select using (auth.uid() = owner_id);
create policy "Users can create their own follow ups"
  on public.follow_ups for insert with check (auth.uid() = owner_id);
create policy "Users can update their own follow ups"
  on public.follow_ups for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users can delete their own follow ups"
  on public.follow_ups for delete using (auth.uid() = owner_id);

drop policy if exists "Users can view their own activities" on public.activities;
drop policy if exists "Users can create their own activities" on public.activities;

create policy "Users can view their own activities"
  on public.activities for select using (auth.uid() = owner_id);
create policy "Users can create their own activities"
  on public.activities for insert with check (auth.uid() = owner_id);

-- UPDATED_AT TRIGGER
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

drop trigger if exists calls_set_updated_at on public.calls;
create trigger calls_set_updated_at
before update on public.calls
for each row execute function public.set_updated_at();

drop trigger if exists example-provider-call-id on public.example-provider-call-id;
create trigger example-provider-call-id
before update on public.example-provider-call-id
for each row execute function public.set_updated_at();

drop trigger if exists follow_ups_set_updated_at on public.follow_ups;
create trigger follow_ups_set_updated_at
before update on public.follow_ups
for each row execute function public.set_updated_at();
