-- Live rename migration: renames the placeholder table names that were
-- deployed under the literal name "example-provider-call-id" to proper names.
-- Safe to run repeatedly: each statement is guarded by an existence check.

do $$
begin
  -- Rename the outcomes table if it still has the placeholder name
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'example-provider-call-id'
  ) then
    alter table public."example-provider-call-id" rename to call_outcomes;
  end if;

  -- Rename the templates table if it still has the placeholder name
  -- (second migration created a separate table with the same placeholder name)
  -- The templates table has a "name" column with a unique constraint but no call_id column.
  -- The outcomes table has a call_id column. Distinguish them by checking for call_id.
  -- After the rename above, any remaining "example-provider-call-id" must be the
  -- call_instructions table (which has call_id and owner_id but was a different CREATE).
  -- Check for call_templates separately.
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'call_templates'
  ) = false then
    -- call_templates doesn't exist yet; nothing to rename from the placeholder
    -- (the templates table may not have been created if migration 2 was skipped)
    null;
  end if;
end
$$;

-- Ensure call_outcomes table exists with correct structure (idempotent fallback)
create table if not exists public.call_outcomes (
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

-- Ensure call_templates table exists (idempotent fallback)
create table if not exists public.call_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  purpose text not null,
  description text,
  category text not null default 'standard'
    check (category in ('standard', 'custom')),
  created_at timestamptz not null default now()
);

insert into public.call_templates (name, purpose, description, category) values
  ('loan_recovery', 'Loan Repayment Follow-up', 'Understand repayment status and identify appropriate next step', 'standard'),
  ('payment_reminder', 'Payment Reminder', 'Remind customer about upcoming/overdue payment and understand if assistance is needed', 'standard'),
  ('payment_confirmation', 'Payment Confirmation', 'Confirm whether a payment has been made and identify any discrepancy', 'standard'),
  ('customer_followup', 'Customer Follow-up', 'Reconnect with customer who needs another conversation or confirmation', 'standard'),
  ('repayment_assistance', 'Repayment Assistance', 'Explore payment options and assistance programs for customers in difficulty', 'standard'),
  ('account_inquiry', 'Account Inquiry', 'Address customer questions about their account status and details', 'standard'),
  ('custom', 'Custom Call', 'Human-directed call with specific operator-provided objective and context', 'standard')
on conflict (name) do nothing;

-- Ensure call_instructions table exists (idempotent fallback)
create table if not exists public.call_instructions (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.calls(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid references public.call_templates(id) on delete set null,
  template_name text,
  custom_question text,
  custom_context text,
  amount numeric(15,2),
  currency text default 'NGN',
  due_date date,
  reference_info text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS for new tables
alter table public.call_outcomes enable row level security;
alter table public.call_templates enable row level security;
alter table public.call_instructions enable row level security;

-- call_outcomes policies (drop first for idempotency)
drop policy if exists "Users can view outcomes for their calls" on public.call_outcomes;
drop policy if exists "Users can create outcomes for their calls" on public.call_outcomes;
drop policy if exists "Users can update outcomes for their calls" on public.call_outcomes;

create policy "Users can view outcomes for their calls"
  on public.call_outcomes for select
  using (exists (
    select 1 from public.calls
    where calls.id = call_outcomes.call_id and calls.owner_id = auth.uid()
  ));
create policy "Users can create outcomes for their calls"
  on public.call_outcomes for insert
  with check (exists (
    select 1 from public.calls
    where calls.id = call_outcomes.call_id and calls.owner_id = auth.uid()
  ));
create policy "Users can update outcomes for their calls"
  on public.call_outcomes for update
  using (exists (
    select 1 from public.calls
    where calls.id = call_outcomes.call_id and calls.owner_id = auth.uid()
  ));

-- call_templates policies
drop policy if exists "All authenticated users can view call templates" on public.call_templates;
create policy "All authenticated users can view call templates"
  on public.call_templates for select to authenticated using (true);

-- call_instructions policies
drop policy if exists "Users can view their own call instructions" on public.call_instructions;
drop policy if exists "Users can create their own call instructions" on public.call_instructions;
drop policy if exists "Users can update their own call instructions" on public.call_instructions;
drop policy if exists "Users can delete their own call instructions" on public.call_instructions;

create policy "Users can view their own call instructions"
  on public.call_instructions for select using (auth.uid() = owner_id);
create policy "Users can create their own call instructions"
  on public.call_instructions for insert with check (auth.uid() = owner_id);
create policy "Users can update their own call instructions"
  on public.call_instructions for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users can delete their own call instructions"
  on public.call_instructions for delete using (auth.uid() = owner_id);

-- Indexes
create index if not exists call_outcomes_call_id_idx on public.call_outcomes(call_id);
create index if not exists call_templates_name_idx on public.call_templates(name);
create index if not exists call_instructions_call_id_idx on public.call_instructions(call_id);
create index if not exists call_instructions_owner_id_idx on public.call_instructions(owner_id);

-- Updated_at triggers
drop trigger if exists call_outcomes_set_updated_at on public.call_outcomes;
create trigger call_outcomes_set_updated_at
before update on public.call_outcomes
for each row execute function public.set_updated_at();

drop trigger if exists call_instructions_set_updated_at on public.call_instructions;
create trigger call_instructions_set_updated_at
before update on public.call_instructions
for each row execute function public.set_updated_at();
