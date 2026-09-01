// SERVEX Customer Care
// Supabase Edge Function: start-customer-call
// CALL-E API integration based on the current CALL-E Calls API documentation.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const calleApiKey = Deno.env.get("CALLE_API_KEY");

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

    if (!customer.phone) {
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

    const webhookUrl =
      `${supabaseUrl}/functions/v1/calle-webhook`;

    const normalizedCustomerPhone = normalizePhoneForCall(customer.phone);

    // CALL-E's current Calls API uses recipients[].phones[].
    // Use E.164 phone numbers in the customer record.
    const callPayload = {
      task:
        body.task ??
        `You are SERVEX Customer Care. Call ${customer.name} for a professional customer-care conversation. Understand the customer's reason for contact, answer or clarify what you can, identify any issue requiring follow-up, and summarize the outcome clearly. Do not discuss internal credentials or private system information.`,
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
              "follow_up",
              "no_answer",
              "unclear",
            ],
            description:
              "Use resolved when the customer-care issue was clearly handled. Use follow_up when SERVEX needs another action. Use no_answer when the recipient was not reached. Use unclear when the outcome cannot be determined.",
          },
          customer_summary: {
            type: "string",
            description:
              "Brief summary of what the customer said and what was discussed.",
          },
          follow_up_required: {
            type: "string",
            enum: ["yes", "no", "unknown"],
            description:
              "Use yes when a SERVEX follow-up action is clearly needed, no when none is needed, and unknown when the evidence is insufficient.",
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