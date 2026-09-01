# SERVEXA Phase 2 Implementation - Deployment & Testing Guide

## ✅ What Was Implemented

### 1. **Webhook Handler** (`supabase/functions/calle-webhook/index.ts`)
Receives CALL-E call completion events and persists outcomes to Supabase:
- Updates call status and metadata (duration, recording_url, transcript)
- Creates call_outcomes records with outcome, sentiment, action_required
- Creates activity records for dashboard visibility
- Creates follow-up tasks when escalation is needed
- Idempotency: Won't create duplicates if webhook is retried

### 2. **Database Schema Extension** (Migration: `20260901000000_call_templates_and_instructions.sql`)
Two new tables:
- **call_templates**: Standard templates seeded (Loan Recovery, Payment Reminder, etc.)
- **call_instructions**: Stores human-provided instructions, amount, currency, due date per call

### 3. **Updated Edge Function** (`start-customer-call/index.ts`)
Enhanced to support human-directed calls:
- Accepts: `template_name`, `custom_question`, `custom_context`, `amount`, `currency`, `due_date`, `reference_info`
- Creates call_instructions record
- Merges custom instruction naturally into AI system prompt
- Preserves idempotency key for webhook

### 4. **Call Template UI** (`src/app/call-instruction.tsx`)
New screen with 4-step flow:
1. **Select Customer** - Browse and select from list
2. **Select Template** - Choose template type (Loan Recovery, Payment Reminder, etc.)
3. **Enter Details** - Custom question, amount, due date, context
4. **Confirm & Initiate** - Review and start call

Features:
- Real customer loading from Supabase
- Template-specific fields (amount for Loan Recovery, due_date for Payment Reminder)
- Validation (requires either custom question or amount)
- Error handling with alerts

### 5. **Updated Activity Screen** (`src/app/activity.tsx`)
Replaced mock data with real data:
- Queries `activities` table from Supabase
- Fetches customer names for display
- Shows real outcomes, sentiments, escalation flags
- Displays next actions and follow-up requirements
- Loading and empty states
- Time formatting (ago format)
- Activity type classification

### 6. **Navigation Integration** (`src/app/customers.tsx`)
- Added "Directed call" button next to "Call customer" button
- Links to new call-instruction screen
- Styled as secondary button

### 7. **Supabase Config** (`supabase/config.toml`)
- Registered `calle-webhook` function (verify_jwt=false)
- Ready for deployment

---

## 🚀 Deployment Steps

### Step 1: Apply Database Migration
```bash
cd c:\Users\hp\SERVEXA
npx supabase migration up
# Or if using local dev:
supabase db push
```

### Step 2: Deploy Edge Functions
```bash
# Deploy both functions
npx supabase functions deploy start-customer-call --project-ref <your-project-ref>
npx supabase functions deploy calle-webhook --project-ref <your-project-ref>
```

### Step 3: Build and Test Locally
```bash
npm run web
# Or: expo start --web
```

---

## 🧪 Testing Guide

### Test 1: Verify Webhook Handler Works
**Objective**: Confirm call outcomes persist in database

1. Make a test call from Customers screen
2. CALL-E will initiate the call
3. When call completes, CALL-E sends webhook
4. Check Supabase:
   ```sql
   SELECT * FROM calls WHERE id = 'test-call-id';
   SELECT * FROM call_outcomes WHERE call_id = 'test-call-id';
   SELECT * FROM activities WHERE call_id = 'test-call-id';
   ```
5. Verify: status changed from "initiated" to "completed", outcomes recorded

### Test 2: Standard Call Flow
**Objective**: Confirm standard call still works end-to-end

1. Open **Customers** screen
2. Select a customer
3. Click **"Call customer"**
4. Wait for call to complete
5. Navigate to **Activity** screen
6. Verify: Call appears in activity list with:
   - Customer name ✓
   - Call status (resolved/follow-up/attention) ✓
   - Outcome description ✓
   - Time indicator ✓
7. Refresh page
8. Verify: Activity record still visible (persisted in DB)

### Test 3: Human-Directed Call (Loan Recovery Template)
**Objective**: Confirm custom instructions reach AI naturally

1. Open **Customers** screen
2. Click **"Directed call"** button
3. **Step 1**: Select a customer (e.g., "Michael Brown")
4. **Step 2**: Select template = "Loan Recovery"
5. **Step 3 - Details**:
   - Amount: `₦85,000`
   - Currency: `NGN`
   - Due Date: `2026-09-08` (next week)
   - Specific Question: `"Ask whether the customer can make a partial payment this week."`
   - Additional Context: `"The customer previously mentioned salary coming Friday."`
6. **Step 4**: Review details and click **"Initiate Call"**
7. Wait for call to complete
8. **Verify**:
   - Call was initiated ✓
   - SERVEXA asked about the partial payment *naturally* (not robotic) ✓
   - Customer response captured ✓
   - Outcome recorded in dashboard ✓

### Test 4: Human-Directed Call (Payment Reminder Template)
**Objective**: Different template with different context

1. Open **Customers** screen → **"Directed call"**
2. Select customer
3. Template: "Payment Reminder"
4. Details:
   - Amount: `₦50,000`
   - Due Date: `2026-09-03` (overdue)
   - Specific Question: `"Confirm if the payment was already made"`
5. Initiate call
6. Verify: SERVEXA confirms payment status naturally ✓

### Test 5: Activity Dashboard Persistence
**Objective**: Real records visible after refresh

1. Make a standard call (from Customers)
2. Navigate to **Activity** screen
3. Verify call appears in list
4. **Refresh the browser** (F5 or Cmd+R)
5. Verify: Call still appears (DB persisted, not mock) ✓
6. Wait 5 minutes, refresh again
7. Verify: Still visible ✓

### Test 6: Idempotency (Duplicate Webhook Prevention)
**Objective**: Verify webhook can be retried without creating duplicates

Manual test (requires webhook URL access):
1. Make a call and note the call_id
2. Wait for webhook to complete
3. Manually send the same webhook payload again
   ```bash
   curl -X POST https://[your-supabase]/functions/v1/calle-webhook \
     -H "Content-Type: application/json" \
     -d '{"id":"call-123","metadata":{"servexa_call_id":"xxx"},"status":"completed"}'
   ```
4. Check database:
   ```sql
   SELECT COUNT(*) FROM call_outcomes WHERE call_id = 'xxx';
   ```
5. Verify: Only ONE outcome record exists (not duplicated) ✓

### Test 7: Activity Types Classification
**Objective**: Verify activity type colors are correct

After several calls, check Activity screen:
- **Green (Resolved)**: outcome = "resolved" ✓
- **Yellow (Follow-up)**: outcome = "follow_up_needed" or follow_up_required=true ✓
- **Red (Attention)**: escalation_required=true or escalation_reason present ✓

---

## ✅ Acceptance Criteria

- [ ] Webhook handler receives and persists call outcomes
- [ ] Standard call flow works (initiate → complete → dashboard)
- [ ] Human-directed call can be created with template
- [ ] Custom instruction reaches AI and is incorporated naturally
- [ ] Activity dashboard shows real records (not mock)
- [ ] Records persist after browser refresh
- [ ] Duplicate webhooks don't create duplicate records
- [ ] Escalation flags trigger follow-up tasks
- [ ] All activity types (resolved, follow-up, attention) display correctly

---

## 📊 Current System Status

**Before This Phase:**
- ❌ Webhook handler missing
- ❌ No template/instruction system
- ❌ Activity screen showed mock data
- ❌ Call outcomes never persisted

**After This Phase:**
- ✅ Webhook handler captures all outcomes
- ✅ Templates + instruction system implemented
- ✅ Activity screen shows real data from Supabase
- ✅ All call outcomes persisted
- ✅ Idempotency prevents duplicates
- ✅ Dashboard reflects reality after refresh

---

## 🔧 If Issues Arise

### Issue: Activity screen shows "No activities yet"
**Check**:
1. Were calls actually made? (check Supabase `calls` table)
2. Did webhook receive the completion event? (check Supabase logs)
3. Is `calle-webhook` function deployed? (check Supabase Edge Functions)
4. Is webhook URL correct in `start-customer-call`? (should be `{supabaseUrl}/functions/v1/calle-webhook`)

### Issue: Directed call button leads to blank screen
**Check**:
1. Is `call-instruction.tsx` properly saved?
2. Does app still build? (`npm run web`)
3. Are there TypeScript errors? (check terminal)

### Issue: Custom question doesn't reach AI
**Check**:
1. Is `call_instructions` record created? (query Supabase)
2. Is Edge Function properly passing `customInstructionSection` to system prompt?
3. Review actual CALL-E response in logs

### Issue: Duplicate records created
**Check**:
1. Is webhook using `Idempotency-Key` header? (should be localCall.id)
2. Is webhook checking for existing records? (should use `maybeSingle()`)

---

## 📝 Code Files Changed

1. ✅ `supabase/functions/calle-webhook/index.ts` - NEW
2. ✅ `supabase/migrations/20260901000000_call_templates_and_instructions.sql` - NEW
3. ✅ `supabase/functions/start-customer-call/index.ts` - UPDATED
4. ✅ `src/app/call-instruction.tsx` - NEW
5. ✅ `src/app/activity.tsx` - UPDATED
6. ✅ `src/app/customers.tsx` - UPDATED
7. ✅ `supabase/config.toml` - UPDATED

---

## 🎯 Next Phase (Phase 3 - Optional)

- [ ] Call record detail view (click activity → see full transcript)
- [ ] Transcript display and search
- [ ] Bulk call scheduling (upload CSV of customers)
- [ ] Call performance analytics
- [ ] A/B testing different instruction wordings
- [ ] Custom template creation UI
- [ ] Multi-language support for AI prompts
