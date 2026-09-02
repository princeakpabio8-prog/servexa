// SERVEXA Webhook Handler
// Receives CALL-E terminal call task events (call.completed / call.failed /
// call.result_validation_failed) and persists outcomes.
// Payload shape per https://docs.heycall-e.com/webhooks:
// { id, type, created_at, data: { id, status, recipients[], structured_result,
//   summary, metadata, failure_code, failure_message, created_at, completed_at } }
// Supabase Edge Function: calle-webhook

// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, calle-event-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TranscriptTurn = {
  offset_seconds?: number;
  speaker?: string;
  text?: string;
};

type CallAttempt = {
  id?: string;
  phone?: string;
  status?: string;
  started_at?: string;
  completed_at?: string;
  summary?: string | null;
  transcript_turns?: TranscriptTurn[];
  provider_call_id?: string;
  failure_code?: string | null;
  failure_message?: string | null;
};

type Recipient = {
  id?: string;
  phones?: string[];
  status?: string;
  structured_result?: Record<string, unknown> | null;
  summary?: string | null;
  attempts?: CallAttempt[];
};

type CallTaskData = {
  id?: string;
  status?: string;
  task?: string;
  recipients?: Recipient[];
  structured_result?: Record<string, unknown> | null;
  summary?: string;
  task_completed?: boolean;
  metadata?: {
    servexa_call_id?: string;
    customer_id?: string;
    campaign_id?: string;
  };
  failure_code?: string | null;
  failure_message?: string | null;
  created_at?: string;
  completed_at?: string;
};

type CallEEvent = {
  id?: string;
  type?: string;
  created_at?: string;
  data?: CallTaskData;
};

const STATUS_BY_EVENT_TYPE: Record<string, string> = {
  "call.completed": "completed",
  "call.result_validation_failed": "completed",
  "call.failed": "failed",
};

const buildTranscript = (recipient?: Recipient) => {
  const attempts = recipient?.attempts ?? [];
  const lastAttempt = attempts[attempts.length - 1];
  const turns = lastAttempt?.transcript_turns ?? [];

  if (!turns.length) return null;

  return turns.map((t) => `${t.speaker ?? "unknown"}: ${t.text ?? ""}`).join("\n");
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

    const rawBody = await req.text();
    const event = JSON.parse(rawBody) as CallEEvent;

    // CALL-E's receiver contract: require the event-id header to match the body.
    // This isn't cryptographic proof of origin, but rejects malformed/blind requests.
    const eventIdHeader = req.headers.get("calle-event-id") ?? req.headers.get("CALL-E-Event-Id");
    if (!eventIdHeader || !event.id || eventIdHeader !== event.id) {
      return json({ error: "invalid event id" }, 400);
    }

    const data = event.data;
    if (!data) {
      return json({ warning: "No data in webhook event" }, 200);
    }

    const servexaCallId = data.metadata?.servexa_call_id;
    if (!servexaCallId) {
      console.warn("Webhook received without servexa_call_id", event.id, event.type);
      return json({ warning: "No servexa_call_id in webhook" }, 200);
    }

    // Find the call record
    const { data: callRecord, error: callError } = await supabase
      .from("calls")
      .select("id, owner_id, customer_id, status")
      .eq("id", servexaCallId)
      .single();

    if (callError || !callRecord) {
      console.error("Call record not found:", servexaCallId, callError);
      return json({ error: "Call record not found" }, 404);
    }

    // Idempotency: at-least-once delivery means we may see this event again.
    if (callRecord.status === "completed" || callRecord.status === "failed") {
      return json({ success: true, duplicate: true, call_id: servexaCallId });
    }

    const status = STATUS_BY_EVENT_TYPE[event.type ?? ""] ?? data.status ?? "completed";
    const recipient = data.recipients?.[0];
    const lastAttempt = recipient?.attempts?.[recipient.attempts.length - 1];
    const transcript = buildTranscript(recipient);
    const structuredResult = (data.structured_result ?? recipient?.structured_result ?? null) as
      | Record<string, unknown>
      | null;

    const startedAt = lastAttempt?.started_at ?? data.created_at;
    const endedAt = lastAttempt?.completed_at ?? data.completed_at;

    // Update call status and metadata
    const updateData: Record<string, unknown> = { status };

    if (startedAt) updateData.started_at = startedAt;
    if (endedAt) updateData.ended_at = endedAt;
    if (startedAt && endedAt) {
      const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
      if (Number.isFinite(durationMs) && durationMs >= 0) {
        updateData.duration_seconds = Math.round(durationMs / 1000);
      }
    }
    if (transcript) updateData.transcript = transcript;
    if (data.id) updateData.provider_call_id = data.id;

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
      .from("example-provider-call-id")
      .select("id")
      .eq("call_id", servexaCallId)
      .maybeSingle();

    const outcome =
      (structuredResult?.outcome as string | undefined) ??
      (event.type === "call.failed" ? "connectivity_issue" : "unknown");
    const summary =
      (structuredResult?.customer_summary as string | undefined) ??
      data.summary ??
      recipient?.summary ??
      data.failure_message ??
      null;
    const sentiment = structuredResult?.customer_sentiment as string | undefined;
    const nextAction = structuredResult?.next_action as string | undefined;
    const escalationReason = structuredResult?.escalation_reason as string | undefined;

    if (!existingOutcome) {
      const { error: outcomeError } = await supabase.from("example-provider-call-id").insert({
        call_id: servexaCallId,
        outcome,
        summary,
        sentiment,
        action_required: nextAction,
        actionable: Boolean(escalationReason),
      });

      if (outcomeError) {
        console.error("Failed to create outcome:", outcomeError);
        throw outcomeError;
      }
    }

    // Create activity record for dashboard visibility
    const { error: activityError } = await supabase.from("activities").insert({
      owner_id: callRecord.owner_id,
      customer_id: callRecord.customer_id,
      call_id: servexaCallId,
      activity_type: "example-provider-call-id",
      title: `Call ${status === "failed" ? "failed" : "completed"} - ${outcome}`,
      description: summary ?? "Call processed",
      metadata: {
        outcome,
        sentiment,
        payment_status: structuredResult?.payment_status,
        escalation_required: Boolean(escalationReason),
        escalation_reason: escalationReason,
        stated_difficulty: structuredResult?.stated_difficulty,
        promised_payment_date: structuredResult?.promised_payment_date,
        follow_up_required: structuredResult?.follow_up_required === "yes",
        next_action: nextAction,
        failure_code: data.failure_code,
      },
    });

    if (activityError) {
      console.error("Failed to create activity:", activityError);
      // Don't fail the webhook if activity creation fails - outcome is already saved
    }

    // If escalation is needed, create a follow-up task
    if (escalationReason) {
      const { error: followUpError } = await supabase.from("follow_ups").insert({
        owner_id: callRecord.owner_id,
        customer_id: callRecord.customer_id,
        call_id: servexaCallId,
        title: `Escalation: ${escalationReason}`,
        description: `Escalation required from call. Reason: ${escalationReason}. Customer summary: ${summary ?? "n/a"}`,
        status: "pending",
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Due in 24h
      });

      if (followUpError) {
        console.error("Failed to create follow-up:", followUpError);
        // Don't fail webhook - log and continue
      }
    }

    console.log("Webhook processed successfully:", servexaCallId, event.type);

    return json({ success: true, call_id: servexaCallId, outcome });
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

