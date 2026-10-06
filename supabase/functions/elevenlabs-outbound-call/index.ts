// SERVEXA — ElevenLabs Outbound Call
// Supabase Edge Function: elevenlabs-outbound-call
//
// Initiates an outbound call via ElevenLabs Conversational AI SIP-trunk API.
// Architecture:
//   SERVEXA AI Employee → ElevenLabs agent → SIP trunk → Twilio Elastic SIP → Nigerian PSTN (+234)
//
// Official endpoint:
//   POST https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call
//
// Required secrets (set via `supabase secrets set` — never in source code):
//   ELEVENLABS_API_KEY          — ElevenLabs API key (xi-api-key header)
//   ELEVENLABS_AGENT_ID         — Default ElevenLabs Conversational AI agent ID
//   ELEVENLABS_PHONE_NUMBER_ID  — The agent_phone_number_id registered in ElevenLabs
//                                  (must point to your provisioned SIP-trunk DID)
//
// The CALL-E integration is completely untouched. Both providers coexist.

// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

// ─── Constants ────────────────────────────────────────────────────────────────

const ELEVENLABS_OUTBOUND_URL =
  "https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type RequestBody = {
  /** SERVEXA customer UUID — resolves phone + name from DB */
  customer_id?: string;
  /** Raw E.164 phone (used for ad-hoc / test calls when no customer_id) */
  phone?: string;
  customer_name?: string;
  /** SERVEXA campaign/AI-employee UUID — used to load employee context */
  campaign_id?: string | null;
  /** Override the default ElevenLabs agent ID for this call */
  agent_id?: string;
  /** Optional additional operator instruction injected as a dynamic variable */
  custom_instruction?: string;
  /** Optional customer-context string (loan amount, due date, etc.) */
  custom_context?: string;
};

type EmployeeContext = {
  id: string;
  name: string;
  role: string;
  objective: string | null;
  description: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalise any phone string to strict E.164 (required by ElevenLabs + PSTN). */
const toE164 = (raw: string): string => {
  const digits = raw.replace(/\s+/g, "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  return digits.startsWith("+") ? digits : `+${digits.replace(/\+/g, "")}`;
};

/** Validate E.164 — must start with +, 8–16 chars total. */
const isE164 = (phone: string): boolean => /^\+[1-9]\d{6,14}$/.test(phone);

/**
 * Build ElevenLabs `conversation_initiation_client_data` from an AI Employee
 * record. These values are passed as dynamic variables that the ElevenLabs
 * agent can reference in its prompt template (e.g. {{employee_name}},
 * {{employee_role}}, etc.) and as a first-turn system context injection.
 *
 * The employee's description/instructions become behavioral guidance, NOT a
 * fixed script — the ElevenLabs agent interprets them dynamically.
 *
 * See: https://elevenlabs.io/docs/conversational-ai/customization/conversation-initiation
 */
function buildConversationInitiationData(
  employee: EmployeeContext | null,
  customer: { name: string; phone: string },
  customInstruction: string | undefined,
  customContext: string | undefined
): Record<string, unknown> {
  // Dynamic variables — referenced in the ElevenLabs agent prompt as {{var_name}}
  const dynamicVariables: Record<string, string> = {
    customer_name: customer.name,
    customer_phone: customer.phone,
  };

  if (employee) {
    dynamicVariables.employee_name = employee.name;
    dynamicVariables.employee_role =
      employee.role ?? employee.objective ?? "AI Call Assistant";
    dynamicVariables.employee_objective = employee.objective ?? "";
    dynamicVariables.employee_instructions = employee.description ?? "";
  }

  if (customInstruction) {
    dynamicVariables.operator_instruction = customInstruction;
  }
  if (customContext) {
    dynamicVariables.call_context = customContext;
  }

  return {
    // ElevenLabs uses `dynamic_variables` to inject values into the agent prompt.
    dynamic_variables: dynamicVariables,
  };
}

/**
 * Build the system-level first message / agent prompt override.
 * This is the behavioral layer: the ElevenLabs agent receives the employee's
 * role and instructions as context so it behaves as the configured AI employee.
 *
 * The override is passed via `conversation_config_override.agent.prompt.prompt`
 * per the ElevenLabs Conversational AI API spec. If the ElevenLabs agent already
 * has a well-configured system prompt, this can be omitted — set
 * ELEVENLABS_USE_PROMPT_OVERRIDE=true to enable it.
 */
function buildPromptOverride(
  employee: EmployeeContext | null,
  customer: { name: string },
  customInstruction: string | undefined,
  customContext: string | undefined
): string | null {
  if (!employee) return null;

  const role = employee.role ?? employee.objective ?? "AI Call Assistant";
  const instructions = employee.description?.trim();

  let prompt = `You are ${employee.name}, a ${role} working for SERVEXA.

CUSTOMER: ${customer.name}
YOUR JOB: ${role}
`;

  if (instructions) {
    prompt += `
BEHAVIORAL INSTRUCTIONS:
${instructions}
`;
  }

  if (customInstruction) {
    prompt += `
OPERATOR INSTRUCTION FOR THIS CALL:
${customInstruction}
`;
  }

  if (customContext) {
    prompt += `
CALL CONTEXT:
${customContext}
`;
  }

  prompt += `
CORE PRINCIPLES:
- Be professional, empathetic, and concise.
- Respond dynamically to what the customer says — do not read from a script.
- Ask one question at a time and listen carefully.
- Never invent account details, balances, or commitments.
- If you cannot resolve the issue, offer to have a human representative follow up.

At the end of the call, ensure you have:
- Identified the customer's situation
- Captured their key response or commitment
- Noted whether follow-up is required
`;

  return prompt.trim();
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
    // ── Environment ──────────────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    const elevenLabsApiKey = Deno.env.get("ELEVENLABS_API_KEY") as string;
    const defaultAgentId = Deno.env.get("ELEVENLABS_AGENT_ID") as string;
    const defaultPhoneNumberId = Deno.env.get("ELEVENLABS_PHONE_NUMBER_ID") as string;
    const usePromptOverride = Deno.env.get("ELEVENLABS_USE_PROMPT_OVERRIDE") === "true";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase environment variables are missing");
    }
    if (!elevenLabsApiKey) {
      throw new Error(
        "ELEVENLABS_API_KEY secret is not configured. " +
        "Set it via: supabase secrets set ELEVENLABS_API_KEY=<your-key>"
      );
    }
    if (!defaultAgentId) {
      throw new Error(
        "ELEVENLABS_AGENT_ID secret is not configured. " +
        "Set it via: supabase secrets set ELEVENLABS_AGENT_ID=<your-agent-id>"
      );
    }
    if (!defaultPhoneNumberId) {
      throw new Error(
        "ELEVENLABS_PHONE_NUMBER_ID secret is not configured. " +
        "This must be the agent_phone_number_id registered in ElevenLabs " +
        "and linked to your SIP-trunk DID. " +
        "Set it via: supabase secrets set ELEVENLABS_PHONE_NUMBER_ID=<id>"
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = (await req.json()) as RequestBody;

    // ── Resolve customer ─────────────────────────────────────────────────────
    let customer: { id: string; name: string; phone: string; owner_id: string } | null = null;

    if (body.customer_id) {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, owner_id")
        .eq("id", body.customer_id)
        .single();

      if (error || !data) {
        return json({ error: "Customer not found" }, 404);
      }
      customer = data;
    } else if (body.phone) {
      // Ad-hoc / test call by phone number
      const normalised = toE164(body.phone);
      if (!isE164(normalised)) {
        return json(
          { error: "Invalid phone number. Must be E.164 format (e.g. +2348012345678)." },
          400
        );
      }

      // Look up or create a minimal customer record for traceability
      const { data: existing } = await supabase
        .from("customers")
        .select("id, name, phone, owner_id")
        .eq("phone", normalised)
        .limit(1)
        .maybeSingle();

      if (existing) {
        customer = existing;
      } else {
        // Need an owner_id — use first available workspace owner
        const { data: ownerRow } = await supabase
          .from("customers")
          .select("owner_id")
          .limit(1)
          .maybeSingle();

        const ownerId = ownerRow?.owner_id;
        if (!ownerId) {
          return json(
            { error: "No workspace owner found. Create a customer record first." },
            400
          );
        }

        const { data: created, error: createErr } = await supabase
          .from("customers")
          .insert({
            owner_id: ownerId,
            name: body.customer_name ?? "Test customer",
            phone: normalised,
            status: "active",
          })
          .select("id, name, phone, owner_id")
          .single();

        if (createErr || !created) {
          throw new Error(createErr?.message ?? "Could not create customer record");
        }
        customer = created;
      }
    } else {
      return json({ error: "customer_id or phone is required" }, 400);
    }

    if (!customer.phone) {
      return json({ error: "Customer does not have a phone number" }, 400);
    }

    const toNumber = toE164(customer.phone);
    if (!isE164(toNumber)) {
      return json(
        {
          error: `Customer phone '${customer.phone}' could not be normalised to E.164. ` +
                 "Update the customer record with a valid number (e.g. +2348012345678).",
        },
        400
      );
    }

    // ── Resolve AI Employee (campaign) context ────────────────────────────────
    let employee: EmployeeContext | null = null;

    if (body.campaign_id) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id, name, objective, description")
        .eq("id", body.campaign_id)
        .maybeSingle();

      if (campaign) {
        employee = {
          id: campaign.id,
          name: campaign.name,
          role: campaign.objective ?? campaign.description ?? "AI Call Assistant",
          objective: campaign.objective ?? null,
          description: campaign.description ?? null,
        };
      }
    }

    // ── Create SERVEXA call record before hitting ElevenLabs ─────────────────
    // (same pattern as CALL-E: create first so webhook can correlate)
    const { data: localCall, error: localCallError } = await supabase
      .from("calls")
      .insert({
        owner_id: customer.owner_id,
        customer_id: customer.id,
        campaign_id: body.campaign_id ?? null,
        status: "queued",
        provider: "elevenlabs",         // new provider column (migration applied)
      })
      .select("id")
      .single();

    if (localCallError || !localCall) {
      throw new Error(localCallError?.message ?? "Could not create local call record");
    }

    // ── Build ElevenLabs request ──────────────────────────────────────────────
    const agentId = body.agent_id ?? defaultAgentId;

    const conversationInitiationData = buildConversationInitiationData(
      employee,
      customer,
      body.custom_instruction,
      body.custom_context
    );

    // conversation_config_override allows injecting a prompt override and
    // a first_message so the agent introduces itself as the AI employee.
    const conversationConfigOverride: Record<string, unknown> = {};

    if (usePromptOverride && employee) {
      const promptOverride = buildPromptOverride(
        employee,
        customer,
        body.custom_instruction,
        body.custom_context
      );
      if (promptOverride) {
        conversationConfigOverride.agent = {
          prompt: {
            prompt: promptOverride,
          },
          // Override first message to introduce the AI employee by name
          first_message: `Hello, this is ${employee.name} from SERVEXA. Am I speaking with ${customer.name}?`,
        };
      }
    }

    // Webhook URL — ElevenLabs will POST conversation events here
    const webhookUrl = `${supabaseUrl}/functions/v1/elevenlabs-webhook`;

    // ElevenLabs SIP-trunk outbound call payload
    // Ref: https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call
    const elPayload: Record<string, unknown> = {
      agent_id: agentId,
      agent_phone_number_id: defaultPhoneNumberId,
      to_number: toNumber,
      // Pass SERVEXA call ID so the webhook can correlate the conversation
      // back to the exact SERVEXA call record.
      metadata: {
        servexa_call_id: localCall.id,
        customer_id: customer.id,
        campaign_id: body.campaign_id ?? null,
      },
      conversation_initiation_client_data: conversationInitiationData,
    };

    // Only include config override when non-empty
    if (Object.keys(conversationConfigOverride).length > 0) {
      elPayload.conversation_config_override = conversationConfigOverride;
    }

    const elResponse = await fetch(ELEVENLABS_OUTBOUND_URL, {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(elPayload),
    });

    const responseText = await elResponse.text();
    let elData: Record<string, unknown>;
    try {
      elData = JSON.parse(responseText);
    } catch {
      elData = { raw: responseText };
    }

    if (!elResponse.ok) {
      // Mark call as failed in SERVEXA
      await supabase
        .from("calls")
        .update({ status: "failed" })
        .eq("id", localCall.id);

      return json(
        {
          error: "ElevenLabs API request failed",
          details: elData,
          note: "Ensure ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, and " +
                "ELEVENLABS_PHONE_NUMBER_ID are correctly configured, and that " +
                "the Twilio SIP trunk is provisioned and linked in ElevenLabs.",
        },
        502
      );
    }

    // ElevenLabs returns `conversation_id` for the initiated call session.
    // We store it as provider_call_id for webhook correlation and Call Detail display.
    const providerCallId =
      typeof elData.conversation_id === "string"
        ? elData.conversation_id
        : typeof elData.call_sid === "string"
        ? elData.call_sid
        : null;

    await supabase
      .from("calls")
      .update({
        provider_call_id: providerCallId,
        status: "initiated",
        started_at: new Date().toISOString(),
      })
      .eq("id", localCall.id);

    return json({
      success: true,
      servexa_call_id: localCall.id,
      provider: "elevenlabs",
      provider_call_id: providerCallId,
      to_number: toNumber,
      agent_id: agentId,
      status: "initiated",
    });
  } catch (error) {
    console.error("elevenlabs-outbound-call error:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Unexpected server error",
      },
      500
    );
  }
});

// ─── Response helper ──────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
