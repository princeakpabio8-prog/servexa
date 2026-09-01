// SERVEXA Webhook Handler
// Receives CALL-E completion events and persists outcomes
// Supabase Edge Function: calle-webhook

// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WebhookPayload = {
  event?: string;
  call_id?: string;
  id?: string;
  status?: string;
  duration?: number;
  started_at?: string;
  ended_at?: string;
  recording_url?: string;
  transcript?: string;
  result?: {
    outcome?: string;
    customer_summary?: string;
    customer_sentiment?: string;
    payment_status?: string;
    stated_difficulty?: string;
    promised_payment_date?: string;
    follow_up_required?: string;
    escalation_reason?: string;
    next_action?: string;
  };
  metadata?: {
    servexa_call_id?: string;
    customer_id?: string;
    campaign_id?: string;
  };
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Supabase environment variables are missing");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const payload = (await req.json()) as WebhookPayload;

    // Extract IDs from metadata or payload
    const servexaCallId = payload.metadata?.servexa_call_id || payload.call_id;
    const providerId = payload.id;

    if (!servexaCallId) {
      console.warn("Webhook received without servexa_call_id", payload);
      return json({ warning: "No servexa_call_id in webhook" }, 200);
    }

    // Find the call record
    const { data: callRecord, error: callError } = await supabase
      .from("calls")
      .select("id, owner_id, customer_id")
      .eq("id", servexaCallId)
      .single();

    if (callError || !callRecord) {
      console.error("Call record not found:", servexaCallId, callError);
      return json({ error: "Call record not found" }, 404);
    }

    // Update call status and metadata
    const updateData: Record<string, unknown> = {
      status: payload.status || "completed",
    };

    if (payload.started_at) updateData.started_at = payload.started_at;
    if (payload.ended_at) updateData.ended_at = payload.ended_at;
    if (payload.duration) updateData.duration_seconds = payload.duration;
    if (payload.recording_url) updateData.recording_url = payload.recording_url;
    if (payload.transcript) updateData.transcript = payload.transcript;
    if (providerId) updateData.provider_call_id = providerId;

    const { error: updateError } = await supabase
      .from("calls")
      .update(updateData)
      .eq("id", servexaCallId)
      .eq("owner_id", callRecord.owner_id);

    if (updateError) {
      console.error("Failed to update call:", updateError);
      throw updateError;
    }

    // Check if outcome already exists (idempotency)
    const { data: existingOutcome } = await supabase
      .from("call_outcomes")
      .select("id")
      .eq("call_id", servexaCallId)
      .single();

    // Only create outcome once
    if (!existingOutcome && payload.result) {
      const { error: outcomeError } = await supabase
        .from("call_outcomes")
        .insert({
          call_id: servexaCallId,
          outcome: payload.result.outcome || "unknown",
          summary: payload.result.customer_summary,
          sentiment: payload.result.customer_sentiment,
          action_required: payload.result.next_action,
          actionable: payload.result.escalation_reason ? true : false,
        })
        .eq("owner_id", callRecord.owner_id);

      if (outcomeError) {
        console.error("Failed to create outcome:", outcomeError);
        throw outcomeError;
      }
    }

    // Create activity record for dashboard visibility
    const { error: activityError } = await supabase
      .from("activities")
      .insert({
        owner_id: callRecord.owner_id,
        customer_id: callRecord.customer_id,
        call_id: servexaCallId,
        activity_type: "call_completed",
        title: `Call completed - ${payload.result?.outcome || "processed"}`,
        description: payload.result?.customer_summary || "Call processed",
        metadata: {
          outcome: payload.result?.outcome,
          sentiment: payload.result?.customer_sentiment,
          payment_status: payload.result?.payment_status,
          escalation_required: !!payload.result?.escalation_reason,
          escalation_reason: payload.result?.escalation_reason,
          stated_difficulty: payload.result?.stated_difficulty,
          promised_payment_date: payload.result?.promised_payment_date,
          follow_up_required: payload.result?.follow_up_required === "yes",
          next_action: payload.result?.next_action,
        },
      });

    if (activityError) {
      console.error("Failed to create activity:", activityError);
      // Don't fail the webhook if activity creation fails - outcome is already saved
    }

    // If escalation is needed, optionally create a follow-up task
    if (payload.result?.escalation_reason) {
      const { error: followUpError } = await supabase
        .from("follow_ups")
        .insert({
          owner_id: callRecord.owner_id,
          customer_id: callRecord.customer_id,
          call_id: servexaCallId,
          title: `Escalation: ${payload.result.escalation_reason}`,
          description: `Escalation required from call. Reason: ${payload.result.escalation_reason}. Customer summary: ${payload.result.customer_summary}`,
          status: "pending",
          due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Due in 24h
        });

      if (followUpError) {
        console.error("Failed to create follow-up:", followUpError);
        // Don't fail webhook - log and continue
      }
    }

    console.log("Webhook processed successfully:", servexaCallId);

    return json({
      success: true,
      call_id: servexaCallId,
      outcome: payload.result?.outcome,
    });
  } catch (error) {
    console.error("calle-webhook error:", error);

    return json(
      {
        error: error instanceof Error ? error.message : "Unexpected server error",
      },
      500
    );
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
