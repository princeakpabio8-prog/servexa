-- SERVEXA: User Profiles & Workspace Settings
-- Adds per-user persistent storage for:
--   user_profiles  : name, company, email, business type, use cases (onboarding data)
--   workspace_settings : per-user automation preferences and plan state
--
-- Every row is scoped to auth.uid() via RLS — Customer A can never read or
-- write Customer B's data.

-- ──────────────────────────────────────────────────────────────
-- USER PROFILES
-- One row per authenticated user. Created during onboarding.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.user_profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  full_name    text        not null default '',
  company_name text        not null default '',
  email        text        not null default '',
  business_type text       not null default '',
  use_cases    text[]      not null default '{}',
  initials     text        not null default '',   -- derived: first letters of full_name, stored for perf
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists user_profiles_id_idx on public.user_profiles(id);

alter table public.user_profiles enable row level security;

create policy "Users can view their own profile"
  on public.user_profiles for select using (auth.uid() = id);
create policy "Users can insert their own profile"
  on public.user_profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile"
  on public.user_profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- WORKSPACE SETTINGS
-- One row per user. Stores automation preferences and plan info.
-- Preferences are per-user so Customer A's settings never affect
-- Customer B. Created with sensible defaults on first access.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.workspace_settings (
  id                    uuid        primary key references auth.users(id) on delete cascade,
  auto_follow_ups       boolean     not null default true,
  escalate_difficult    boolean     not null default true,
  payment_reminders     boolean     not null default true,
  plan_name             text        not null default 'Free',
  plan_status           text        not null default 'active'
    check (plan_status in ('active', 'cancelled', 'trial', 'past_due')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists workspace_settings_id_idx on public.workspace_settings(id);

alter table public.workspace_settings enable row level security;

create policy "Users can view their own workspace settings"
  on public.workspace_settings for select using (auth.uid() = id);
create policy "Users can insert their own workspace settings"
  on public.workspace_settings for insert with check (auth.uid() = id);
create policy "Users can update their own workspace settings"
  on public.workspace_settings for update using (auth.uid() = id) with check (auth.uid() = id);

drop trigger if exists workspace_settings_set_updated_at on public.workspace_settings;
create trigger workspace_settings_set_updated_at
before update on public.workspace_settings
for each row execute function public.set_updated_at();
