-- SERVEXA API Foundation
-- Adds two tables needed for the external VEYRA-facing API:
--   api_keys  : server-to-server authentication tokens for external integrations
--   agent_deployments : lifecycle tracking for campaign/agent deployments via the API

-- ──────────────────────────────────────────────────────────────
-- API KEYS
-- Stores hashed bearer tokens used by external integrations.
-- The raw token is shown to the owner once at creation; only the
-- SHA-256 hash is stored here, so a breach of the DB does not
-- expose live secrets.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.api_keys (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,                       -- human label, e.g. "VEYRA production"
  key_hash    text        not null unique,                -- SHA-256(raw_token) hex
  key_prefix  text        not null,                      -- first 8 chars of raw token for display
  scopes      text[]      not null default '{read}'::text[],
  last_used_at timestamptz,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists api_keys_owner_id_idx  on public.api_keys(owner_id);
create index if not exists api_keys_key_hash_idx  on public.api_keys(key_hash);

alter table public.api_keys enable row level security;

-- Key owners can manage their own keys through the app
create policy "Users can view their own api keys"
  on public.api_keys for select using (auth.uid() = owner_id);
create policy "Users can create their own api keys"
  on public.api_keys for insert with check (auth.uid() = owner_id);
create policy "Users can update their own api keys"
  on public.api_keys for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users can delete their own api keys"
  on public.api_keys for delete using (auth.uid() = owner_id);

-- ──────────────────────────────────────────────────────────────
-- AGENT DEPLOYMENTS
-- Tracks the lifecycle of deploying a campaign (agent) via the
-- external API. A single campaign may have many deployments over
-- time (e.g. redeploy with new config).
-- ──────────────────────────────────────────────────────────────
create table if not exists public.agent_deployments (
  id              uuid        primary key default gen_random_uuid(),
  owner_id        uuid        not null references auth.users(id) on delete cascade,
  campaign_id     uuid        not null references public.campaigns(id) on delete cascade,
  api_key_id      uuid        references public.api_keys(id) on delete set null,
  status          text        not null default 'pending'
    check (status in ('pending', 'deploying', 'active', 'failed', 'stopped')),
  config          jsonb       not null default '{}'::jsonb, -- caller-supplied config snapshot
  error_message   text,
  deployed_at     timestamptz,
  stopped_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists agent_deployments_owner_id_idx    on public.agent_deployments(owner_id);
create index if not exists agent_deployments_campaign_id_idx on public.agent_deployments(campaign_id);
create index if not exists agent_deployments_status_idx      on public.agent_deployments(status);

alter table public.agent_deployments enable row level security;

create policy "Users can view their own deployments"
  on public.agent_deployments for select using (auth.uid() = owner_id);
create policy "Users can create their own deployments"
  on public.agent_deployments for insert with check (auth.uid() = owner_id);
create policy "Users can update their own deployments"
  on public.agent_deployments for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Updated_at trigger
drop trigger if exists agent_deployments_set_updated_at on public.agent_deployments;
create trigger agent_deployments_set_updated_at
before update on public.agent_deployments
for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- AGENT TRIALS
-- Tracks trial calls initiated via the external API.
-- Links an api_key → campaign (agent) → a call record.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.agent_trials (
  id           uuid        primary key default gen_random_uuid(),
  owner_id     uuid        not null references auth.users(id) on delete cascade,
  campaign_id  uuid        not null references public.campaigns(id) on delete cascade,
  call_id      uuid        references public.calls(id) on delete set null,
  api_key_id   uuid        references public.api_keys(id) on delete set null,
  status       text        not null default 'pending'
    check (status in ('pending', 'initiated', 'completed', 'failed')),
  phone        text        not null,
  config       jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists agent_trials_owner_id_idx    on public.agent_trials(owner_id);
create index if not exists agent_trials_campaign_id_idx on public.agent_trials(campaign_id);
create index if not exists agent_trials_call_id_idx     on public.agent_trials(call_id);

alter table public.agent_trials enable row level security;

create policy "Users can view their own trials"
  on public.agent_trials for select using (auth.uid() = owner_id);
create policy "Users can create their own trials"
  on public.agent_trials for insert with check (auth.uid() = owner_id);
create policy "Users can update their own trials"
  on public.agent_trials for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop trigger if exists agent_trials_set_updated_at on public.agent_trials;
create trigger agent_trials_set_updated_at
before update on public.agent_trials
for each row execute function public.set_updated_at();
