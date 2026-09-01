# SERVEXA - Customer Care Platform

## Quick Start

### Prerequisites
- Node.js 18+
- Expo CLI
- Supabase account

### Installation

```bash
npm install
```

### Development

```bash
npm run start
npm run web  # For web development
```

### Environment Variables

Create `.env.local`:
```
EXPO_PUBLIC_SUPABASE_URL=https://nbzqplaoafcsmjeumfyq.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xqOxnb7SgQF1p3IZtK3Ssw__qj-TOha
```

## Features

- **Customer Management**: View and manage customer relationships
- **AI-Powered Calls**: Invoke the `start-customer-call` Edge Function to initiate AI customer care calls via CALL-E API
- **Call Tracking**: Automatic recording of call status and outcomes
- **Follow-up Scheduling**: Schedule follow-up actions with customers

## Production Deployment

### Option 1: Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

Vercel will automatically:
1. Build the web app via `npx expo export -p web`
2. Deploy to Vercel's CDN
3. Use environment variables from `vercel.json`

### Option 2: Expo EAS (Native Apps)

```bash
npm install -g eas-cli
eas build --platform ios  # iOS
eas build --platform android  # Android
eas submit  # Submit to app stores
```

### Option 3: GitHub Pages

```bash
# Build static export
npx expo export -p web

# Deploy to GitHub Pages
# Copy contents of dist/ to gh-pages branch
```

## Integration Details

### Customer Call Flow

1. User selects a customer (for example, Example Customer)
2. Click "Call customer" button
3. App invokes `start-customer-call` Edge Function with:
   - `customer_id`: Database UUID from Supabase
   - `task`: Custom prompt for AI agent
4. Edge Function:
   - Verifies customer exists in Supabase
   - Creates call record
   - Calls CALL-E API to initiate call
   - Returns `provider_call_id` and `servexa_call_id`
5. Call status updates in real-time

### Database Schema

**customers** table:
- `id` (UUID primary key)
- `owner_id` (UUID, references auth.users)
- `name`, `phone`, `email`, `company`
- `status` (active/inactive/blocked)

**calls** table:
- `id` (UUID primary key)
- `customer_id`, `owner_id`, `campaign_id`
- `provider_call_id` (from CALL-E)
- `status` (queued/initiated/completed/failed)
- `transcript`, `recording_url`

## Testing

Use fictional data for authorized testing:
- **Name**: Example Customer
- **ID**: example-customer-id
- **Phone**: +12025550100reserved documentation number; do not dial)
- **Reason**: Sample repayment question

## Troubleshooting

### "Unable to place AI call"
- Customer is not available to the application
- Confirm the selected customer record is valid before placing a call

### Call fails with "Customer not found"
- Customer record does not exist in Supabase
- Confirm the selected customer record before retrying

### "CALL-E request failed"
- Phone number is not valid E.164 format
- CALL-E API is rejecting the call
- Check CALLE_API_KEY secret in Supabase

## Architecture

```
SERVEXA (Expo Web/Native)
  ↓ (supabase.functions.invoke)
Supabase Edge Function: start-customer-call
  ↓
Supabase Database (customers, calls tables)
Supabase Secrets (CALLE_API_KEY, SUPABASE_SERVICE_ROLE_KEY)
  ↓
CALL-E API (https://api.heycall-e.com/v1/calls)
```

## Security Notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code (only in Edge Function)
- Use `SUPABASE_ANON_KEY` for client authentication
- Edge Function handles all sensitive operations
- No API keys in frontend code
- All customer data protected by Supabase RLS policies

## Support

For integration issues with the Edge Function, refer to the Supabase console for logs and monitoring.

---

**Status**: The `start-customer-call` Edge Function is ready for authorized testing with fictional or otherwise approved test data.
