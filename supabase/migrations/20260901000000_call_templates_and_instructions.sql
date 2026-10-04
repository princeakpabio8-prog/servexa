-- SERVEXA Schema Extension: Call Templates & Instructions
-- Migration for human-directed call templates and custom instructions

-- Call templates lookup table (read-only, populated with standard templates)
create table if not exists public.call_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  purpose text not null,
  description text,
  category text not null default 'standard'
    check (category in ('standard', 'custom')),
  created_at timestamptz not null default now()
);

-- Populate standard templates
insert into public.call_templates (name, purpose, description, category) values
  ('loan_recovery', 'Loan Repayment Follow-up', 'Understand repayment status and identify appropriate next step', 'standard'),
  ('payment_reminder', 'Payment Reminder', 'Remind customer about upcoming/overdue payment and understand if assistance is needed', 'standard'),
  ('payment_confirmation', 'Payment Confirmation', 'Confirm whether a payment has been made and identify any discrepancy', 'standard'),
  ('customer_followup', 'Customer Follow-up', 'Reconnect with customer who needs another conversation or confirmation', 'standard'),
  ('repayment_assistance', 'Repayment Assistance', 'Explore payment options and assistance programs for customers in difficulty', 'standard'),
  ('account_inquiry', 'Account Inquiry', 'Address customer questions about their account status and details', 'standard'),
  ('custom', 'Custom Call', 'Human-directed call with specific operator-provided objective and context', 'standard')
on conflict (name) do nothing;

-- Call instructions: Human-directed customization for individual calls
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

-- Indexes
create index if not exists call_templates_name_idx on public.call_templates(name);
create index if not exists call_instructions_call_id_idx on public.call_instructions(call_id);
create index if not exists call_instructions_owner_id_idx on public.call_instructions(owner_id);

-- RLS
alter table public.call_templates enable row level security;
alter table public.call_instructions enable row level security;

-- Call templates are readable by all authenticated users (reference data)
create policy "All authenticated users can view call templates"
  on public.call_templates for select to authenticated using (true);

-- Users can view/create/update/delete their own call instructions
create policy "Users can view their own call instructions"
  on public.call_instructions for select using (auth.uid() = owner_id);
create policy "Users can create their own call instructions"
  on public.call_instructions for insert with check (auth.uid() = owner_id);
create policy "Users can update their own call instructions"
  on public.call_instructions for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users can delete their own call instructions"
  on public.call_instructions for delete using (auth.uid() = owner_id);
