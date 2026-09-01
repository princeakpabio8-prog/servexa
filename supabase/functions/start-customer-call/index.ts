// SERVEX Customer Care
// Supabase Edge Function: start-customer-call
// CALL-E API integration based on the current CALL-E Calls API documentation.

// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CALLE_API_URL = "https://api.heycall-e.com/v1/calls";

type RequestBody = {
  customer_id?: string;
  phone?: string;
  customer_name?: string;
  campaign_id?: string | null;
  task?: string;
  // Human-directed call parameters
  template_name?: string;
  custom_question?: string;
  custom_context?: string;
  amount?: number;
  currency?: string;
  due_date?: string;
  reference_info?: string;
};

const normalizePhoneForCall = (phone: string) => {
  const digits = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');

  if (!digits) return '';
  if (!digits.startsWith('+')) return `+${digits.replace(/\+/g, '')}`;

  return digits;
};

const getFallbackOwnerId = async (supabase: ReturnType<typeof createClient>) => {
  const { data, error } = await supabase
    .from('customers')
    .select('owner_id')
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.owner_id as string;
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

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Supabase environment variables are missing");
    }

    if (!calleApiKey) {
      throw new Error("CALLE_API_KEY secret is not configured");
    }

    // Use service role key to bypass RLS for backend calls (verify_jwt = false allows this)
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const body = (await req.json()) as RequestBody;
    const normalizedPhone = body.phone ? normalizePhoneForCall(body.phone) : null;

    let customer: {
      id: string;
      name: string;
      phone: string;
      owner_id: string;
    } | null = null;

    if (body.customer_id) {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("id, name, phone, owner_id")
        .eq("id", body.customer_id)
        .single();

      if (customerError || !customerData) {
        return json({ error: "Customer not found" }, 404);
      }

      customer = customerData;
    } else if (normalizedPhone) {
      const fallbackOwnerId = await getFallbackOwnerId(supabase);

      if (!fallbackOwnerId) {
        return json({ error: "No valid project owner is available for manual test calls. Create a customer record first." }, 400);
      }

      const { data: existingCustomer, error: existingCustomerError } = await supabase
        .from("customers")
        .select("id, name, phone, owner_id")
        .eq("phone", normalizedPhone)
        .limit(1)
        .maybeSingle();

      if (existingCustomerError) {
        throw new Error(existingCustomerError.message);
      }

      if (existingCustomer) {
        customer = existingCustomer;
      } else {
        const { data: createdCustomer, error: createCustomerError } = await supabase
          .from("customers")
          .insert({
            owner_id: fallbackOwnerId,
            name: body.customer_name ?? "Manual test customer",
            phone: normalizedPhone,
            status: "active",
          })
          .select("id, name, phone, owner_id")
          .single();

        if (createCustomerError || !createdCustomer) {
          throw new Error(createCustomerError?.message ?? "Could not create test customer record");
        }

        customer = createdCustomer;
      }
    } else {
      return json({ error: "customer_id or phone is required" }, 400);
    }

    // Ensure customer is not null before proceeding
    if (!customer || !customer.phone) {
      return json({ error: "Customer does not have a phone number" }, 400);
    }

    // Create the SERVEX record before calling CALL-E so the webhook can
    // correlate the external call with the internal customer record.
    const { data: localCall, error: localCallError } = await supabase
      .from("calls")
      .insert({
        owner_id: customer.owner_id,
        customer_id: customer.id,
        campaign_id: body.campaign_id ?? null,
        status: "queued",
      })
      .select("id")
      .single();

    if (localCallError || !localCall) {
      throw new Error(
        localCallError?.message ?? "Could not create local call record",
      );
    }

    // Create call instructions record if template/instruction params provided
    if (body.template_name || body.custom_question) {
      const { error: instructionError } = await supabase
        .from("call_instructions")
        .insert({
          call_id: localCall.id,
          owner_id: customer.owner_id,
          template_name: body.template_name || "custom",
          custom_question: body.custom_question,
          custom_context: body.custom_context,
          amount: body.amount ? parseFloat(body.amount.toString()) : null,
          currency: body.currency || "NGN",
          due_date: body.due_date,
          reference_info: body.reference_info,
        });

      if (instructionError) {
        console.warn("Failed to create call_instructions:", instructionError);
        // Don't fail the entire call if instruction record fails
      }
    }

    const webhookUrl =
      `${supabaseUrl}/functions/v1/calle-webhook`;

    const normalizedCustomerPhone = normalizePhoneForCall(customer.phone);

    // Build the system prompt with template/instruction context
    let callPurpose = body.task || "Account inquiry and customer care";
    let customInstructionSection = "";

    // If human-directed instruction provided, add context naturally
    if (body.template_name || body.custom_question) {
      let instructionContext = "";

      if (body.template_name === "loan_recovery" && body.amount) {
        instructionContext = `You are calling regarding an outstanding loan of ${body.currency || "NGN"} ${body.amount}.`;
      } else if (body.template_name === "payment_reminder" && body.due_date) {
        instructionContext = `A payment is due on ${body.due_date}.`;
      } else if (body.template_name === "payment_confirmation" && body.amount) {
        instructionContext = `You need to confirm if a payment of ${body.currency || "NGN"} ${body.amount} has been made.`;
      }

      if (body.custom_question) {
        customInstructionSection = `
SPECIFIC QUESTION FROM OPERATOR:
During the conversation, naturally work in this question: "${body.custom_question}"
The question should feel part of the natural conversation, not a sudden switch of topic.
Adapt the wording based on what the customer has already told you.
${body.custom_context ? `Additional context for this question: ${body.custom_context}` : ""}

`;
      }

      if (instructionContext) {
        callPurpose = `${body.template_name?.replace(/_/g, " ")} - ${instructionContext}`;
      }
    }

    // Professional AI system prompt for financial customer care
    const systemPrompt = `You are SERVEXA Customer Care, a professional financial services representative with decades of experience handling customer conversations with exceptional empathy, respect, and professionalism.

CUSTOMER CONTEXT:
- Name: ${customer.name}
- Account Number: (available if verified)
- Call Purpose: ${callPurpose}

${customInstructionSection}CORE PRINCIPLES:
1. EMPATHY & RESPECT: Communicate like an experienced professional. Be warm, patient, and genuinely interested. Never shame, threaten, or embarrass.
2. ACTIVE LISTENING: Respond specifically to what the customer says. Don't just read scripts. If they say "I lost my job," acknowledge that and ask appropriate follow-up questions.
3. ONE QUESTION AT A TIME: Ask single, relevant questions and wait for answers. Don't interrogate.
4. PROFESSIONAL LANGUAGE: Use phrases like "I understand that can be difficult" and "Let's see what we can do" rather than accusatory language.

CONVERSATION FLOW:
1. OPENING (30 seconds):
   - Greeting: "Hello, this is SERVEXA Customer Care. Am I speaking with ${customer.name}?"
   - After confirmation: "Thank you. I'm calling regarding your account with us. Is now a convenient time for a brief conversation?"
   - Listen to their response. If busy: "No problem. What would be a better time to reach you?" and offer to call back
   - If available: "Thank you. I'd like to understand how things are going with your account and see whether there's anything we can assist you with."

2. UNDERSTANDING THE SITUATION (1-2 minutes):
   - Ask what brought them to our attention or why they're on this call
   - Listen carefully to their explanation
   - Acknowledge their situation: "I understand" or "Thank you for explaining that"
   - Ask one clarifying question based on what they said

3. IDENTIFICATION (1-2 minutes):
   Determine which situation applies:
   - A: Customer is ready to pay
   - B: Customer already paid (don't demand payment)
   - C: Customer cannot currently pay
   - D: Customer lost income/employment
   - E: Customer disputes the amount
   - F: Customer says account is incorrect
   - G: Customer requests more time
   - H: Customer wants a payment arrangement
   - I: Customer is angry or distressed
   - J: Customer wants to speak to a human
   - K: Customer is confused about terms
   - L: Customer refuses to discuss
   - M: Customer has connectivity issues
   - N: Customer is unavailable now

4. RESPONSE (2-3 minutes):
   Based on the situation:
   
   For A (Ready to pay): "Thank you for that commitment. Let me confirm the details of your account and we'll arrange the payment right away."
   
   For B (Already paid): "Thank you for mentioning that. I appreciate you letting me know. Let me verify this information so I can ensure your payment is properly recorded in our system."
   
   For C (Cannot pay now): "I understand. Thank you for being honest about your situation. Let's talk about what's currently preventing the payment and see what options might be available."
   
   For D (Lost job/income): "I'm genuinely sorry to hear that. That must be challenging. Let's focus on understanding your current situation and what we can do to help."
   
   For E (Disputes amount): "Thank you for bringing that to my attention. I want to make sure we get this right. Can you help me understand what you believe the correct amount should be and why?"
   
   For I (Angry/distressed): "I hear your frustration, and I appreciate you telling me directly. Let's take a step back and work through this together. I'm here to help."
   
   For J (Wants human representative): "I completely understand. Let me arrange for you to speak with someone on our team who can address this comprehensively."
   
   For other situations: Ask a follow-up question specific to what they've said. Never assume or invent information.

5. NEXT STEPS (1 minute):
   - If payment is discussed: "So just to confirm, you'll make the payment by [date/time]. Is that correct?"
   - If escalation needed: "I'm going to arrange for our team to reach out to you tomorrow with a comprehensive solution."
   - If dispute/verification: "We'll review this and follow up with you within 24 hours with an answer."
   - Confirm their preferred contact method: "What's the best way to reach you - this number, email, or another phone?"

6. CLOSING:
   - Summarize what was discussed: "So to recap, we discussed [key points]."
   - Confirm next action: "Your next step is [specific action]. Our next step is [what we'll do]."
   - Thank them: "Thank you for taking the time to speak with me today. I appreciate your openness."
   - Professional sign-off: "You'll hear from us by [time]. Have a great day."

CRITICAL BEHAVIORS:
- NEVER invent account details, balances, due dates, or payment arrangements
- If you don't have information: "I don't want to give you incorrect information. Our team will reach out within 24 hours."
- Listen for escalation triggers: disputes, unauthorized activity, high distress, requests for human, complaints
- Handle silence gracefully: "I'm still here. Take your time."
- If customer can't hear you: "Can you hear me? I want to make sure our connection is clear."
- Never rush. Allow thinking time.
- Match their pace and tone (professional but warm)

OUTPUT TRACKING:
At call end, provide clear metrics about:
- Conversation outcome (resolved, follow_up, no_answer, escalation_needed)
- Customer's stated issue and what they said
- Payment status if discussed
- Sentiment (positive, neutral, negative, mixed)
- Whether follow-up is needed
- Escalation reason if applicable

Remember: You are representing SERVEXA with professionalism and care. Every customer deserves to feel heard and respected, even in difficult situations.`;

    // CALL-E's current Calls API uses recipients[].phones[].
    // Use E.164 phone numbers in the customer record.
    const callPayload = {
      task: systemPrompt,
      recipients: [
        {
          phones: [normalizedCustomerPhone],
          region: "NG",
          locale: "en-NG",
        },
      ],
      result_schema: {
        type: "object",
        required: [
          "outcome",
          "customer_summary",
          "follow_up_required",
        ],
        properties: {
          outcome: {
            type: "string",
            enum: [
              "resolved",
              "follow_up_needed",
              "escalation_needed",
              "no_answer",
              "customer_unavailable",
              "connectivity_issue",
            ],
            description:
              "resolved: issue was handled and customer agreed/understood. follow_up_needed: customer needs SERVEXA follow-up but is not yet escalated. escalation_needed: issue requires human agent or management. no_answer: phone rang but customer did not answer. customer_unavailable: customer answered but said they are unavailable. connectivity_issue: call had technical problems.",
          },
          customer_summary: {
            type: "string",
            description:
              "Exact summary of what the customer said, their stated issue, and what was discussed. Quote key phrases if possible.",
          },
          customer_sentiment: {
            type: "string",
            enum: ["positive", "neutral", "negative", "mixed", "unknown"],
            description: "Customer's emotional tone throughout the call.",
          },
          payment_status: {
            type: "string",
            enum: ["ready_to_pay", "already_paid", "cannot_pay_now", "payment_arrangement_discussed", "unknown"],
            description: "If payment was discussed, record the status.",
          },
          stated_difficulty: {
            type: "string",
            description:
              "If customer mentioned a reason for non-payment or difficulty, record it (e.g., 'lost job', 'unexpected expense', 'disputes amount').",
          },
          promised_payment_date: {
            type: "string",
            description:
              "If customer committed to a payment date, record it. Otherwise leave empty.",
          },
          follow_up_required: {
            type: "string",
            enum: ["yes", "no", "unknown"],
            description:
              "yes if SERVEXA follow-up is clearly needed. no if issue is resolved. unknown if evidence is unclear.",
          },
          escalation_reason: {
            type: "string",
            description:
              "If escalation_needed, explain why (e.g., 'customer disputes amount', 'customer requested human', 'potential unauthorized activity').",
          },
          next_action: {
            type: "string",
            description:
              "What should happen next (e.g., 'verify payment', 'arrange callback for payment plan', 'escalate to manager', 'send written confirmation').",
          },
        },
        additionalProperties: false,
      },
      metadata: {
        servexa_call_id: localCall.id,
        customer_id: customer.id,
        campaign_id: body.campaign_id ?? null,
      },
      webhook_url: webhookUrl,
    };

    const calleResponse = await fetch(CALLE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${calleApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": localCall.id,
      },
      body: JSON.stringify(callPayload),
    });

    const responseText = await calleResponse.text();

    let calleData: Record<string, unknown>;
    try {
      calleData = JSON.parse(responseText);
    } catch {
      calleData = { raw: responseText };
    }

    if (!calleResponse.ok) {
      await supabase
        .from("calls")
        .update({ status: "failed" })
        .eq("id", localCall.id)
        .eq("owner_id", customer.owner_id);

      return json(
        {
          error: "CALL-E request failed",
          details: calleData,
        },
        502,
      );
    }

    // Current CALL-E Create Call response uses "id".
    const providerCallId =
      typeof calleData.id === "string" ? calleData.id : null;

    await supabase
      .from("calls")
      .update({
        provider_call_id: providerCallId,
        status: "initiated",
        started_at: new Date().toISOString(),
      })
      .eq("id", localCall.id)
      .eq("owner_id", customer.owner_id);

    return json({
      success: true,
      servexa_call_id: localCall.id,
      provider_call_id: providerCallId,
      status: calleData.status ?? "queued",
    });
  } catch (error) {
    console.error("start-customer-call error:", error);

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error",
      },
      500,
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