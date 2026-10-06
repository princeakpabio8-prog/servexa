-- Migration: add voice provider tracking to calls table
-- Non-breaking: existing rows default to 'calle', new rows can be 'elevenlabs'.
-- The calls table already has provider_call_id (text) for the external ID;
-- this column identifies which provider originated the call.

alter table public.calls
  add column if not exists provider text
    not null
    default 'calle'
    check (provider in ('calle', 'elevenlabs'));

comment on column public.calls.provider is
  'Voice provider that handled this call: calle | elevenlabs';

-- Index for provider-scoped lookups (e.g. elevenlabs webhook correlation)
create index if not exists calls_provider_idx on public.calls(provider);
