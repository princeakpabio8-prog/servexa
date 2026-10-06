// SERVEXA — ElevenLabs Webhook Handler
// Supabase Edge Function: elevenlabs-webhook
//
// Receives ElevenLabs Conversational AI conversation lifecycle events and
// maps them into the existing SERVEXA call model:
//
//   ElevenLabs conversation event
//   → SERVEXA calls (status, transcript, duration)
//   → SERVEXA call_outcomes (outcome, summary, sentiment, action)
//   → SERVEXA activities (dashboard visibility)
//   → SERVEXA follow_ups (escalations)
//
// This mirrors the pattern of calle-webhook exactly, ensuring both providers
// produce identical SERVEXA records that all existing UI screens can display.
//
// ElevenLabs sends a `conversation_id` in the event payload.  The outbound-call
// function stores this as `provider_call_id` on the SERVEXA call record, and
// also embeds the SERVEXA call UUID in the `metadata` field of the initiation
// request — ElevenLabs echoes this metadata back in events, enabling correlation.
//
// Required secrets (none beyond SUPABASE_* which are auto-injected):
//   ELEVENLABS_WEBHOOK_SECRET  — optional HMAC secret for signature verification
//                                Set via: supabase secrets set ELEVENLABS_WEBHOOK_SECRET=<secret>
//                                If not set, signature verification is skipped (log warning).
//
// ElevenLabs webhook event types handled:
//   conversation_initiation_metadata  — call started, save conversation_id
//   conversation_initiated            — (legacy alias, same handling)
//   post_call_transcription           — call ended with full transcript + analysis
//   conversation_audio_event          — (audio stream, ignored)
//
// Ref: https://elevenlabs.io/docs/conversational-ai/customization/events

// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

// ─── Constants ────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, elevenlabs-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Types ────────────────────────────────────────────────────────────────────

/** Metadata we embed when initiating the call — echoed back by ElevenLabs */
type ServexaMetadata = {
  servexa_call_id?: string;
  customer_id?: string;
  campaign_id?: string | null;
};

/** ElevenLabs data_collection / analysis result shape */
type AnalysisResult = {
  success?: boolean;
  failure_reason?: string | null;
  transcript_summary?: string | null;
  evaluation_criteria_results?: Record<string, unknown>;
  data_collection_results?: Record<string, unknown>;
};

/** Transcript item from post_call_transcription events */
type TranscriptItem = {
  role?: "agent" | "user";
  message?: string;
  time_in_call_secs?: number;
};

/** ElevenLabs conversation data — shape varies by event type */
type ConversationData = {
  conversation_id?: string;
  agent_id?: string;
  status?: string;
  call_duration_secs?: number;
  transcript?: TranscriptItem[];
  analysis?: AnalysisResult;
  metadata?: ServexaMetadata;
  // present in some event shapes
  start_time_unix_secs?: number;
  call_successful?: string;
};

/** Top-level ElevenLabs webhook event */
type ElevenLabsEvent = {
  type?: string;
  event_id?: string;
  timestamp?: number;
  data?: ConversationData;
  // Some events embed data at the top level
  conversation_id?: string;
  agent_id?: string;
  metadata?: ServexaMetadata;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a plain-text transcript from ElevenLabs transcript items.
 * Format: "agent: <text>\nuser: <text>"  (matches CALL-E's existing format)
 */
function buildTranscript(items: TranscriptItem[]): string | null {
  if (!items || items.length === 0) return null;
  return items
    .map((t) => `${t.role ?? "unknown"}: ${t.message ?? ""}`)
    .join("\n");
}

/**
 * Map ElevenLabs call_successful / analysis to a SERVEXA outcome string.
 * The outcome values must match the existing call_outcomes.outcome check
 * constraint defined in the SERVEXA schema.
 */
function mapOutcome(data: ConversationData): string {
  // If analysis is available, use it
  if (data.analysis) {
    if (!data.analysis.success) {
      return data.analysis.failure_reason === "no_answer" ? "no_answer" : "connectivity_issue";
    }
    // Try to extract from data_collection_results if the agent captured outcome
    const dcr = data.analysis.data_collection_results ?? {};
    const extractedOutcome = dcr["outcome"] as string | undefined;
    if (extractedOutcome && VALID_OUTCOMES.includes(extractedOutcome)) {
      return extractedOutcome;
    }
  }

  // Fall back on top-level call_successful
  if (data.call_successful === "success" || data.status === "done") {
    return "resolved";
  }
  if (data.call_successful === "failure") {
    return "connectivity_issue";
  }

  return "unknown";
}

const VALID_OUTCOMES = [
  "resolved",
  "follow_up_needed",
  "escalation_needed",
  "no_answer",
  "customer_unavailable",
  "connectivity_issue",
  "unknown",
];

/**
 * Optional HMAC-SHA256 signature verification.
 * ElevenLabs signs webhooks with HMAC-SHA256 using the webhook secret.
 * Header: `elevenlabs-signature: <timestamp>.<signature>`
 * Verification message: `<timestamp>.<raw_body>`
 */
async function verifySignature(
  req: Request,
  rawBody: string,
  secret: string
): Promise<boolean> {
  const sigHeader = req.headers.get("elevenlabs-signature") ?? "";
  if (!sigHeader) return false;

  const [tsStr, sig] = sigHeader.split(".");
  if (!tsStr || !sig) return false;

  const message = `${tsStr}.${rawBody}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, msgData);
  const computedSig = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedSig === sig;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    const webhookSecret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET") as string | undefined;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase environment variables are missing");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const rawBody = await req.text();

    // ── Optional signature verification ──────────────────────────────────────
    if (webhookSecret) {
      const valid = await verifySignature(req, rawBody, webhookSecret);
      if (!valid) {
        console.warn("elevenlabs-webhook: signature verification failed");
        return json({ error: "Invalid webhook signature" }, 401);
      }
    } else {
      console.warn(
        "elevenlabs-webhook: ELEVENLABS_WEBHOOK_SECRET not set — " +
        "signature verification skipped. Set the secret for production security."
      );
    }

    const event = JSON.parse(rawBody) as ElevenLabsEvent;
    const eventType = event.type ?? "";

    // ── Route by event type ──────────────────────────────────────────────────

    // Audio stream events — acknowledge and ignore (no data to process)
    if (eventType === "conversation_audio_event") {
      return json({ success: true, ignored: true, event_type: eventType });
    }

    // conversation_initiation_metadata — fired when call connects
    // Use this to update the provider_call_id if not yet set.
    if (
      eventType === "conversation_initiation_metadata" ||
      eventType === "conversation_initiated"
    ) {
      return await handleInitiation(supabase, event);
    }

    // post_call_transcription — fired when conversation ends with full data
    if (eventType === "post_call_transcription") {
      return await handlePostCall(supabase, event);
    }

    // Unknown event type — acknowledge with a warning
    console.warn("elevenlabs-webhook: unhandled event type:", eventType);
    return json({ success: true, ignored: true, event_type: eventType });
  } catch (error) {
    console.error("elevenlabs-webhook error:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Unexpected server error",
      },
      500
    );
  }
});

// ─── Initiation handler ───────────────────────────────────────────────────────

async function handleInitiation(
  supabase: ReturnType<typeof createClient>,
  event: ElevenLabsEvent
): Promise<Response> {
  const data = event.data ?? (event as unknown as ConversationData);
  const conversationId = data.conversation_id ?? event.conversation_id;
  const metadata: ServexaMetadata =
    data.metadata ?? event.metadata ?? {};

  const servexaCallId = metadata.servexa_call_id;

  if (!servexaCallId) {
    console.warn(
      "elevenlabs-webhook/initiation: no servexa_call_id in metadata",
      event.event_id
    );
    return json({ warning: "No servexa_call_id in event metadata" }, 200);
  }

  if (conversationId) {
    // Store the ElevenLabs conversation_id as provider_call_id for later correlation
    const { error } = await supabase
      .from("calls")
      .update({
        provider_call_id: conversationId,
        status: "in_progress",
        started_at: new Date().toISOString(),
      })
      .eq("id", servexaCallId)
      .eq("provider", "elevenlabs");

    if (error) {
      console.error("elevenlabs-webhook/initiation update error:", error);
    }
  }

  return json({ success: true, event_type: event.type, servexa_call_id: servexaCallId });
}

// ─── Post-call handler ────────────────────────────────────────────────────────

async function handlePostCall(
  supabase: ReturnType<typeof createClient>,
  event: ElevenLabsEvent
): Promise<Response> {
  const data = event.data ?? (event as unknown as ConversationData);
  const metadata: ServexaMetadata =
    data.metadata ?? event.metadata ?? {};

  const servexaCallId = metadata.servexa_call_id;

  if (!servexaCallId) {
    console.warn(
      "elevenlabs-webhook/post_call: no servexa_call_id in metadata",
      event.event_id
    );
    return json({ warning: "No servexa_call_id in event metadata" }, 200);
  }

  // Find the SERVEXA call record
  const { data: callRecord, error: callError } = await supabase
    .from("calls")
    .select("id, owner_id, customer_id, status")
    .eq("id", servexaCallId)
    .single();

  if (callError || !callRecord) {
    console.error("elevenlabs-webhook: call not found:", servexaCallId);
    return json({ error: "Call record not found" }, 404);
  }

  // Idempotency: ignore if already terminal
  if (callRecord.status === "completed" || callRecord.status === "failed") {
    return json({ success: true, duplicate: true, servexa_call_id: servexaCallId });
  }

  // ── Build transcript ──────────────────────────────────────────────────────
  const transcriptItems = data.transcript ?? [];
  const transcript = buildTranscript(transcriptItems);

  // ── Determine final call status ───────────────────────────────────────────
  const isSuccess =
    data.analysis?.success === true ||
    data.call_successful === "success" ||
    data.status === "done";

  const finalStatus = isSuccess ? "completed" : "failed";

  // ── Calculate duration ────────────────────────────────────────────────────
  const durationSeconds = data.call_duration_secs
    ? Math.round(data.call_duration_secs)
    : null;

  const endedAt = new Date().toISOString();
  const startedAt = data.start_time_unix_secs
    ? new Date(data.start_time_unix_secs * 1000).toISOString()
    : null;

  // ── Update call record ────────────────────────────────────────────────────
  const callUpdate: Record<string, unknown> = {
    status: finalStatus,
    ended_at: endedAt,
  };
  if (startedAt) callUpdate.started_at = startedAt;
  if (durationSeconds !== null) callUpdate.duration_seconds = durationSeconds;
  if (transcript) callUpdate.transcript = transcript;
  if (data.conversation_id) callUpdate.provider_call_id = data.conversation_id;

  const { error: updateError } = await supabase
    .from("calls")
    .update(callUpdate)
    .eq("id", servexaCallId)
    .eq("owner_id", callRecord.owner_id);

  if (updateError) {
    console.error("elevenlabs-webhook: call update error:", updateError);
    throw updateError;
  }

  // ── Extract outcome and analysis ──────────────────────────────────────────
  const outcome = mapOutcome(data);
  const summary =
    data.analysis?.transcript_summary ??
    data.analysis?.failure_reason ??
    null;

  // Attempt to extract structured fields from data_collection_results
  // These are populated if the ElevenLabs agent has data collection configured.
  const dcr = (data.analysis?.data_collection_results ?? {}) as Record<string, any>;
  const sentiment = (dcr["customer_sentiment"] ?? null) as string | null;
  const nextAction = (dcr["next_action"] ?? null) as string | null;
  const escalationReason = (dcr["escalation_reason"] ?? null) as string | null;
  const followUpRequired =
    dcr["follow_up_required"] === true ||
    dcr["follow_up_required"] === "yes";

  // ── Write call_outcome ────────────────────────────────────────────────────
  const { data: existingOutcome } = await supabase
    .from("call_outcomes")
    .select("id")
    .eq("call_id", servexaCallId)
    .maybeSingle();

  if (!existingOutcome) {
    const { error: outcomeError } = await supabase.from("call_outcomes").insert({
      call_id: servexaCallId,
      outcome,
      summary,
      sentiment,
      action_required: nextAction,
      actionable: Boolean(escalationReason || followUpRequired),
    });

    if (outcomeError) {
      console.error("elevenlabs-webhook: outcome write error:", outcomeError);
      throw outcomeError;
    }
  }

  // ── Write activity record (dashboard visibility) ──────────────────────────
  const { error: activityError } = await supabase.from("activities").insert({
    owner_id: callRecord.owner_id,
    customer_id: callRecord.customer_id,
    call_id: servexaCallId,
    activity_type: "call_outcome",
    title: `ElevenLabs call ${finalStatus === "failed" ? "failed" : "completed"} — ${outcome}`,
    description: summary ?? "Call processed via ElevenLabs",
    metadata: {
      provider: "elevenlabs",
      outcome,
      sentiment,
      escalation_required: Boolean(escalationReason),
      escalation_reason: escalationReason,
      follow_up_required: followUpRequired,
      next_action: nextAction,
      call_duration_secs: durationSeconds,
      conversation_id: data.conversation_id,
    },
  });

  if (activityError) {
    // Don't fail the webhook if activity write fails — outcome is already saved
    console.error("elevenlabs-webhook: activity write error:", activityError);
  }

  // ── Create follow-up if escalation required ───────────────────────────────
  if (escalationReason) {
    const { error: followUpError } = await supabase.from("follow_ups").insert({
      owner_id: callRecord.owner_id,
      customer_id: callRecord.customer_id,
      call_id: servexaCallId,
      title: `Escalation (ElevenLabs): ${escalationReason}`,
      description:
        `Escalation required from ElevenLabs call. ` +
        `Reason: ${escalationReason}. Summary: ${summary ?? "n/a"}`,
      status: "pending",
      due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    if (followUpError) {
      console.error("elevenlabs-webhook: follow-up write error:", followUpError);
    }
  }

  console.log(
    "elevenlabs-webhook: processed",
    servexaCallId,
    "outcome:", outcome,
    "status:", finalStatus
  );

  return json({
    success: true,
    servexa_call_id: servexaCallId,
    outcome,
    status: finalStatus,
  });
}

// ─── Response helper ──────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
