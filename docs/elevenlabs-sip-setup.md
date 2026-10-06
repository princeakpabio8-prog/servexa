# SERVEXA — ElevenLabs + Twilio SIP Configuration Guide

This document describes every external configuration step required to make the
ElevenLabs voice provider fully operational. The SERVEXA code is complete and
deployed. Everything in this document is external dashboard/CLI configuration.

---

## 1. Supabase Secrets (required before any call can be placed)

Set these using the Supabase CLI. Never put credentials in source code.

```bash
# ElevenLabs API key — from https://elevenlabs.io/app/settings/api-keys
supabase secrets set ELEVENLABS_API_KEY=sk_...

# ElevenLabs Conversational AI agent ID
# From: ElevenLabs dashboard → Conversational AI → your agent → Agent ID
supabase secrets set ELEVENLABS_AGENT_ID=<agent-id>

# ElevenLabs phone number ID (the SIP-trunk DID registered in ElevenLabs)
# From: ElevenLabs dashboard → Conversational AI → Phone Numbers → your number → ID
supabase secrets set ELEVENLABS_PHONE_NUMBER_ID=<phone-number-id>

# Optional: webhook HMAC secret for signature verification
# From: ElevenLabs dashboard → Conversational AI → your agent → Webhooks → Secret
supabase secrets set ELEVENLABS_WEBHOOK_SECRET=<secret>

# Optional: set to "true" to inject the AI Employee's instructions as a
# prompt override on every call (requires the ElevenLabs agent to allow overrides)
supabase secrets set ELEVENLABS_USE_PROMPT_OVERRIDE=true
```

Verify secrets are set:
```bash
supabase secrets list
```

---

## 2. ElevenLabs Conversational AI Agent Setup

### 2a. Create or configure an agent
1. Go to https://elevenlabs.io/app/conversational-ai
2. Create a new Conversational AI agent (or use an existing one)
3. In the agent settings:
   - **System Prompt**: Configure a base prompt. SERVEXA will inject dynamic
     variables (`{{employee_name}}`, `{{employee_role}}`, `{{customer_name}}`,
     `{{employee_instructions}}`, etc.) at call time via `conversation_initiation_client_data`.
   - **First Message**: Optional — SERVEXA can override this per call.
   - **Voice**: Select your preferred ElevenLabs voice.
   - **Language**: Set to match your target market (e.g. English).
4. Copy the **Agent ID** — set as `ELEVENLABS_AGENT_ID`

### 2b. Configure the webhook
1. In the agent settings → **Webhooks**
2. Set the webhook URL to:
   ```
   https://<your-supabase-project>.supabase.co/functions/v1/elevenlabs-webhook
   ```
3. Enable these event types:
   - `conversation_initiation_metadata`
   - `post_call_transcription`
4. Copy the webhook secret — set as `ELEVENLABS_WEBHOOK_SECRET`

### 2c. Dynamic variables in your agent prompt
Reference these in your agent's system prompt (ElevenLabs `{{var}}` syntax):
```
{{employee_name}}         — AI employee name (e.g. "Ada")
{{employee_role}}         — AI employee role (e.g. "Payment follow-up specialist")
{{employee_objective}}    — AI employee objective
{{employee_instructions}} — Full instructions from the AI employee configuration
{{customer_name}}         — Customer's name
{{customer_phone}}        — Customer's phone number
{{operator_instruction}}  — Optional per-call instruction from the operator
{{call_context}}          — Optional per-call context (amount, due date, etc.)
```

---

## 3. Twilio Elastic SIP Trunk Setup

> **Important**: Twilio Elastic SIP Trunking requires an upgraded (paid) Twilio account.
> The code is ready; this configuration is done entirely in the Twilio and ElevenLabs dashboards.

### 3a. Create a Twilio Elastic SIP Trunk
1. Log into https://console.twilio.com
2. Navigate to **Voice** → **SIP Trunking** → **Elastic SIP Trunks**
3. Click **Create new Trunk**
4. Name it (e.g. "SERVEXA ElevenLabs Trunk")

### 3b. Termination SIP URI (ElevenLabs calls OUT through this)
Twilio assigns a **Termination SIP URI** in the format:
```
<your-trunk-name>.pstn.twilio.com
```
Example: `servexa.pstn.twilio.com`

This URI is what ElevenLabs uses to route the call through Twilio to the PSTN.
You will register this URI in the ElevenLabs SIP trunk configuration (step 4).

### 3c. Authentication — IP Access Control List (recommended) or Credential List
- **IP ACL**: Add ElevenLabs' SIP proxy IP ranges to the trunk's IP ACL.
  ElevenLabs provides their IP ranges in their docs; add them to:
  Twilio Console → Voice → SIP Trunking → your trunk → Authentication → IP ACL
- **Credential List** (alternative): Create a SIP credential in Twilio,
  add it to the trunk's Credential List, and provide those credentials to ElevenLabs.

### 3d. Caller ID requirements
- Outbound calls need a valid `From` number.
- You must **purchase or port a Twilio phone number** with voice capability
  that matches your target country (Nigeria: `+234...`).
- Set this number as the caller ID in your ElevenLabs phone number configuration.

### 3e. Nigerian PSTN routing (+234)
- Twilio supports outbound calls to Nigeria (country code `+234`) on upgraded accounts.
- Ensure **International Dialing** is enabled on your Twilio account:
  Twilio Console → Voice → Settings → International dialing → Enable.
- Verify Nigeria (`+234`) is in your permitted destinations:
  Twilio Console → Voice → SIP Trunking → your trunk → Termination → Permitted Destinations

### 3f. Transport
- ElevenLabs SIP trunk integration uses **UDP** and **TCP** transport.
- Twilio Elastic SIP Trunking supports both. No special configuration needed.

---

## 4. Register the SIP Trunk in ElevenLabs

1. Go to https://elevenlabs.io/app/conversational-ai → **Phone Numbers**
2. Click **Add SIP Trunk**
3. Provide:
   - **SIP URI**: your Twilio Termination URI (`<trunk>.pstn.twilio.com`)
   - **Username / Password**: your Twilio SIP credential (if using Credential List auth)
   - **Caller ID number**: the Twilio number you purchased (E.164, e.g. `+2348012345678`)
4. ElevenLabs will assign this SIP trunk configuration a **Phone Number ID**
5. Copy that ID → set as `ELEVENLABS_PHONE_NUMBER_ID`

---

## 5. Apply the Database Migration

The `provider` column migration must be applied to your Supabase project:

```bash
supabase db push
```

Or apply the migration directly:
```sql
-- File: supabase/migrations/20261001000000_calls_provider_column.sql
alter table public.calls
  add column if not exists provider text
    not null
    default 'calle'
    check (provider in ('calle', 'elevenlabs'));
```

---

## 6. Deploy the Edge Functions

```bash
supabase functions deploy elevenlabs-outbound-call
supabase functions deploy elevenlabs-webhook
```

Verify they are live:
```bash
supabase functions list
```

---

## 7. Test the Integration

### 7a. Health check (no live call)
```bash
curl -X POST \
  https://<project>.supabase.co/functions/v1/elevenlabs-outbound-call \
  -H "Authorization: Bearer <supabase-anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+2341234567890"}' 
# Expected: 400 if phone is invalid, or 502 with ElevenLabs error if secrets not set
```

### 7b. Live call test (requires all credentials configured)
Use the SERVEXA Customers screen → select a customer → "Start AI call"
(or invoke the function directly with a real `customer_id` and `campaign_id`).

---

## 8. Current Status Summary

| Component | Status |
|---|---|
| `elevenlabs-outbound-call` Edge Function | ✅ Code complete |
| `elevenlabs-webhook` Edge Function | ✅ Code complete |
| `calls.provider` column migration | ✅ Written, needs `supabase db push` |
| ELEVENLABS_API_KEY | ⬜ Set via `supabase secrets set` |
| ELEVENLABS_AGENT_ID | ⬜ Create agent in ElevenLabs dashboard |
| ELEVENLABS_PHONE_NUMBER_ID | ⬜ Register SIP trunk in ElevenLabs |
| ELEVENLABS_WEBHOOK_SECRET | ⬜ Optional but recommended for production |
| Twilio Elastic SIP Trunk created | ⬜ Twilio dashboard |
| Twilio account upgraded (paid) | ⬜ Required for international calling |
| Nigeria (+234) international dialing enabled | ⬜ Twilio Console |
| Twilio DID purchased (+234) | ⬜ Twilio Console |
| SIP trunk registered in ElevenLabs | ⬜ ElevenLabs dashboard |
| CALLE integration | ✅ Unchanged and fully operational |
