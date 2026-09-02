// SERVEXA Call Status Sync
// Manually fetches the current state of a call from CALL-E's GET /v1/calls/{call_id}
// and backfills calls/call_outcomes/activities/follow_ups. Useful for:
// - Recovering calls that finished before webhook delivery was fixed.
// - "Refresh status" UI action while waiting on the async webhook.
// Supabase Edge Function: sync-call-status

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

const CALLE_API_URL = "https://api.heycall-e.com/v1/calls";

const buildTranscript = (recipient: any) => {
  const attempts = recipient?.attempts ?? [];
  const lastAttempt = attempts[attempts.length - 1];
  const turns = lastAttempt?.transcript_turns ?? [];

  if (!turns.length) return null;

  return turns.map((t: any) => `${t.speaker ?? "unknown"}: ${t.text ?? ""}`).join("\n");
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
    const calleApiKey = Deno.env.get("CALLE_API_KEY") as string;

    if (!supabaseUrl || !supabaseServiceRoleKey || !calleApiKey) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json();
    const servexaCallId = body.call_id as string;

    if (!servexaCallId) {
      return json({ error: "call_id is required" }, 400);
    }

    const { data: callRecord, error: callError } = await supabase
      .from("calls")
      .select("id, owner_id, customer_id, status, provider_call_id")
      .eq("id", servexaCallId)
      .single();

    if (callError || !callRecord) {
      return json({ error: "Call record not found" }, 404);
    }

    if (!callRecord.provider_call_id) {
      return json({ error: "This call has no CALL-E provider id yet" }, 400);
    }

    const calleResponse = await fetch(`${CALLE_API_URL}/${callRecord.provider_call_id}`, {
      headers: { Authorization: `Bearer ${calleApiKey}` },
    });

    if (!calleResponse.ok) {
      const text = await calleResponse.text();
      return json({ error: "CALL-E lookup failed", details: text }, 502);
    }

    const data = await calleResponse.json();

    if (data.status !== "completed" && data.status !== "failed") {
      return json({ success: true, status: data.status, message: "Call has not reached a terminal state yet" });
    }

    if (callRecord.status === "completed" || callRecord.status === "failed") {
      return json({ success: true, duplicate: true, call_id: servexaCallId, status: callRecord.status });
    }

    const recipient = data.recipients?.[0];
    const lastAttempt = recipient?.attempts?.[recipient.attempts.length - 1];
    const transcript = buildTranscript(recipient);
    const structuredResult = data.structured_result ?? recipient?.structured_result ?? null;

    const startedAt = lastAttempt?.started_at ?? data.created_at;
    const endedAt = lastAttempt?.completed_at ?? data.completed_at;

    const updateData: Record<string, unknown> = { status: data.status };
    if (startedAt) updateData.started_at = startedAt;
    if (endedAt) updateData.ended_at = endedAt;
    if (startedAt && endedAt) {
      const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
      if (Number.isFinite(durationMs) && durationMs >= 0) {
        updateData.duration_seconds = Math.round(durationMs / 1000);
      }
    }
    if (transcript) updateData.transcript = transcript;

    const { error: updateError } = await supabase
      .from("calls")
      .update(updateData)
      .eq("id", servexaCallId)
      .eq("owner_id", callRecord.owner_id);

    if (updateError) throw updateError;

    const { data: existingOutcome } = await supabase
      .from("call_outcomes")
      .select("id")
      .eq("call_id", servexaCallId)
      .maybeSingle();

    const outcome = structuredResult?.outcome ?? (data.status === "failed" ? "connectivity_issue" : "unknown");
    const summary =
      structuredResult?.customer_summary ?? data.summary ?? recipient?.summary ?? data.failure_message ?? null;
    const sentiment = structuredResult?.customer_sentiment;
    const nextAction = structuredResult?.next_action;
    const escalationReason = structuredResult?.escalation_reason;

    if (!existingOutcome) {
      const { error: outcomeError } = await supabase.from("call_outcomes").insert({
        call_id: servexaCallId,
        outcome,
        summary,
        sentiment,
        action_required: nextAction,
        actionable: Boolean(escalationReason),
      });

      if (outcomeError) throw outcomeError;
    }

    const { error: activityError } = await supabase.from("activities").insert({
      owner_id: callRecord.owner_id,
      customer_id: callRecord.customer_id,
      call_id: servexaCallId,
      activity_type: "call_completed",
      title: `Call ${data.status === "failed" ? "failed" : "completed"} - ${outcome}`,
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

    if (activityError) console.error("Failed to create activity:", activityError);

    if (escalationReason) {
      const { error: followUpError } = await supabase.from("follow_ups").insert({
        owner_id: callRecord.owner_id,
        customer_id: callRecord.customer_id,
        call_id: servexaCallId,
        title: `Escalation: ${escalationReason}`,
        description: `Escalation required from call. Reason: ${escalationReason}. Customer summary: ${summary ?? "n/a"}`,
        status: "pending",
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      if (followUpError) console.error("Failed to create follow-up:", followUpError);
    }

    return json({ success: true, call_id: servexaCallId, status: data.status, outcome, summary });
  } catch (error) {
    console.error("sync-call-status error:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
