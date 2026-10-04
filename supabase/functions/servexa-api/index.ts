// SERVEXA External API – v1
// Supabase Edge Function: servexa-api
//
// Serves as the versioned integration surface for external platforms (e.g. VEYRA).
// All routes live under /api/v1/* and require a bearer token issued via the
// api_keys table. The service-role key is never exposed to callers.
//
// Routes
//   GET  /api/v1/agents               – list campaigns (agents)
//   GET  /api/v1/agents/:id           – single campaign (agent)
//   POST /api/v1/agents/:id/trials    – start a trial call
//   POST /api/v1/agents/:id/deploy    – deploy an agent
//   GET  /api/v1/deployments/:id      – deployment status
//
// Authentication: Bearer <api_key_raw_token>
//   The raw token is hashed (SHA-256) server-side and matched against
//   the api_keys.key_hash column. The service-role key is never used
//   on the client side.

// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

// ─── Constants ──────────────────────────────────────────────────────────────

const API_VERSION = "v1";
const API_PREFIX  = `/api/${API_VERSION}`;

// CORS: tighten origin in production via SERVEXA_API_ALLOWED_ORIGIN env var
const ALLOWED_ORIGIN = Deno.env.get("SERVEXA_API_ALLOWED_ORIGIN") ?? "*";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ─── Response helpers ────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function apiError(message: string, status: number, code?: string): Response {
  return json({ error: { message, code: code ?? "api_error", status } }, status);
}

// ─── SHA-256 helper (Web Crypto, available in Deno) ──────────────────────────

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Input validation ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUUID(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// E.164-style phone: starts with +, 7–15 digits
const PHONE_RE = /^\+[1-9]\d{6,14}$/;

function isPhone(v: unknown): v is string {
  return typeof v === "string" && PHONE_RE.test(v);
}

// ─── Auth: resolve caller identity from Bearer token ─────────────────────────

type ApiKeyRecord = {
  id: string;
  owner_id: string;
  scopes: string[];
  revoked_at: string | null;
  expires_at: string | null;
};

async function resolveApiKey(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<{ key: ApiKeyRecord; error?: never } | { key?: never; error: Response }> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: apiError("Missing or invalid Authorization header. Use: Authorization: Bearer <api_key>", 401, "missing_auth") };
  }

  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) {
    return { error: apiError("Empty bearer token", 401, "missing_auth") };
  }

  const keyHash = await sha256Hex(rawToken);

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, owner_id, scopes, revoked_at, expires_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data) {
    return { error: apiError("Invalid API key", 401, "invalid_api_key") };
  }

  if (data.revoked_at) {
    return { error: apiError("API key has been revoked", 401, "api_key_revoked") };
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { error: apiError("API key has expired", 401, "api_key_expired") };
  }

  // Fire-and-forget: update last_used_at (non-blocking)
  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {/* ignore */});

  return { key: data as ApiKeyRecord };
}

// ─── Shape helpers: what we expose vs. what lives in the DB ──────────────────

function shapeAgent(campaign: Record<string, unknown>) {
  return {
    id:          campaign.id,
    name:        campaign.name,
    description: campaign.description ?? null,
    objective:   campaign.objective   ?? null,
    status:      campaign.status,
    created_at:  campaign.created_at,
    updated_at:  campaign.updated_at,
    // Note: owner_id is intentionally omitted from external API responses
  };
}

function shapeDeployment(dep: Record<string, unknown>) {
  return {
    id:          dep.id,
    agent_id:    dep.campaign_id,
    status:      dep.status,
    config:      dep.config,
    error_message: dep.error_message ?? null,
    deployed_at: dep.deployed_at ?? null,
    stopped_at:  dep.stopped_at  ?? null,
    created_at:  dep.created_at,
    updated_at:  dep.updated_at,
  };
}

function shapeTrial(trial: Record<string, unknown>, call?: Record<string, unknown> | null) {
  return {
    id:           trial.id,
    agent_id:     trial.campaign_id,
    status:       trial.status,
    call_id:      trial.call_id    ?? null,
    // Call-level timing — populated once the underlying call record exists
    started_at:   call?.started_at ?? null,
    completed_at: call?.ended_at   ?? null,
    // Surface call failure details when the trial or call failed
    call_status:  call?.status     ?? null,
    failure_code: (call as any)?.call_outcomes?.[0]?.outcome === "connectivity_issue"
      ? "connectivity_issue"
      : null,
    created_at:   trial.created_at,
    updated_at:   trial.updated_at,
  };
}

// ─── Route handlers ──────────────────────────────────────────────────────────

/** GET /api/v1/agents */
async function listAgents(
  _req: Request,
  supabase: ReturnType<typeof createClient>,
  ownerId: string
): Promise<Response> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, description, objective, status, created_at, updated_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listAgents DB error:", error);
    return apiError("Failed to retrieve agents", 500, "db_error");
  }

  return json({ data: (data ?? []).map(shapeAgent), count: (data ?? []).length });
}

/** GET /api/v1/agents/:id */
async function getAgent(
  agentId: string,
  supabase: ReturnType<typeof createClient>,
  ownerId: string
): Promise<Response> {
  if (!isUUID(agentId)) {
    return apiError("Invalid agent id – must be a UUID", 400, "invalid_param");
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, description, objective, status, created_at, updated_at")
    .eq("id", agentId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    console.error("getAgent DB error:", error);
    return apiError("Failed to retrieve agent", 500, "db_error");
  }

  if (!data) {
    return apiError("Agent not found", 404, "not_found");
  }

  return json({ data: shapeAgent(data) });
}

/** POST /api/v1/agents/:id/trials */
async function startTrial(
  req: Request,
  agentId: string,
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  apiKeyId: string
): Promise<Response> {
  if (!isUUID(agentId)) {
    return apiError("Invalid agent id – must be a UUID", 400, "invalid_param");
  }

  // Verify the agent belongs to this owner
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .eq("id", agentId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (campaignError) {
    return apiError("Failed to look up agent", 500, "db_error");
  }
  if (!campaign) {
    return apiError("Agent not found", 404, "not_found");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400, "invalid_body");
  }

  // Validate required fields
  const phone = body.phone;
  if (!phone) {
    return apiError("phone is required", 400, "missing_param");
  }
  if (!isPhone(phone)) {
    return apiError("phone must be in E.164 format, e.g. +2348012345678", 400, "invalid_param");
  }

  // Optional: task override, template_name, config passthrough
  const config: Record<string, unknown> = {};
  if (typeof body.task         === "string") config.task          = body.task;
  if (typeof body.template_name === "string") config.template_name = body.template_name;
  if (typeof body.custom_context === "string") config.custom_context = body.custom_context;
  if (typeof body.amount       === "number") config.amount        = body.amount;
  if (typeof body.currency     === "string") config.currency      = body.currency;
  if (typeof body.due_date     === "string") config.due_date      = body.due_date;
  if (typeof body.reference_info === "string") config.reference_info = body.reference_info;

  // Create a trial record first
  const { data: trial, error: trialError } = await supabase
    .from("agent_trials")
    .insert({
      owner_id:    ownerId,
      campaign_id: agentId,
      api_key_id:  apiKeyId,
      status:      "pending",
      phone:       phone as string,
      config,
    })
    .select("id")
    .single();

  if (trialError || !trial) {
    console.error("startTrial insert error:", trialError);
    return apiError("Failed to create trial record", 500, "db_error");
  }

  // ── Delegate to start-customer-call edge function ──────────────────────────
  // We call our own existing function rather than duplicating telephony logic.
  // If SERVEXA_URL is not set, fall back to SUPABASE_URL (same project).
  const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
  const internalFnUrl = `${supabaseUrl}/functions/v1/start-customer-call`;

  // The service-role key is used here for the internal call, never returned to caller.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

  const callPayload: Record<string, unknown> = {
    phone:          phone,
    campaign_id:    agentId,
    customer_name:  body.customer_name ?? "Trial caller",
    ...config,
  };

  let callResult: Record<string, unknown> | null = null;
  let callErr: string | null = null;

  try {
    const callResponse = await fetch(internalFnUrl, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(callPayload),
    });

    const text = await callResponse.text();
    try { callResult = JSON.parse(text); } catch { callResult = { raw: text }; }

    if (!callResponse.ok) {
      callErr = (callResult?.error as string) ?? `start-customer-call returned ${callResponse.status}`;
    }
  } catch (fetchErr) {
    callErr = fetchErr instanceof Error ? fetchErr.message : "Internal call failed";
  }

  // Update trial with call outcome
  const trialUpdate: Record<string, unknown> = {};
  if (callErr) {
    trialUpdate.status = "failed";
  } else {
    trialUpdate.status  = "initiated";
    trialUpdate.call_id = callResult?.servexa_call_id ?? null;
  }

  await supabase
    .from("agent_trials")
    .update(trialUpdate)
    .eq("id", trial.id);

  if (callErr) {
    return json({
      data: { trial_id: trial.id, status: "failed", error: callErr },
    }, 502);
  }

  return json({
    data: {
      trial_id:         trial.id,
      call_id:          callResult?.servexa_call_id ?? null,
      provider_call_id: callResult?.provider_call_id ?? null,
      status:           "initiated",
    },
  }, 201);
}

/** POST /api/v1/agents/:id/deploy */
async function deployAgent(
  req: Request,
  agentId: string,
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  apiKeyId: string
): Promise<Response> {
  if (!isUUID(agentId)) {
    return apiError("Invalid agent id – must be a UUID", 400, "invalid_param");
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .eq("id", agentId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (campaignError) {
    return apiError("Failed to look up agent", 500, "db_error");
  }
  if (!campaign) {
    return apiError("Agent not found", 404, "not_found");
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return apiError("Invalid JSON body", 400, "invalid_body");
  }

  // Sanitise config: only allow known scalar fields
  const config: Record<string, unknown> = {};
  if (typeof body.environment  === "string") config.environment  = body.environment;
  if (typeof body.label        === "string") config.label        = body.label;
  if (typeof body.webhook_url  === "string") config.webhook_url  = body.webhook_url;
  if (typeof body.max_calls    === "number") config.max_calls    = body.max_calls;

  // ── Create the deployment record ──────────────────────────────────────────
  // Full telephony deployment is NOT YET IMPLEMENTED.
  // This creates a tracking record in status "pending".
  // A background process / future implementation must pick this up,
  // provision the telephony side, and update the status to "active".
  const { data: deployment, error: deployError } = await supabase
    .from("agent_deployments")
    .insert({
      owner_id:    ownerId,
      campaign_id: agentId,
      api_key_id:  apiKeyId,
      status:      "pending",
      config,
    })
    .select("id, status, config, created_at, updated_at")
    .single();

  if (deployError || !deployment) {
    console.error("deployAgent insert error:", deployError);
    return apiError("Failed to create deployment", 500, "db_error");
  }

  // Activate the underlying campaign if it is still in draft
  if (campaign.status === "draft") {
    await supabase
      .from("campaigns")
      .update({ status: "active" })
      .eq("id", agentId)
      .eq("owner_id", ownerId);
  }

  return json({
    data: {
      ...shapeDeployment({ ...deployment, campaign_id: agentId }),
      _note: "Deployment record created. Full telephony provisioning is not yet automated — status will remain 'pending' until a provisioning worker is implemented.",
    },
  }, 201);
}

/** GET /api/v1/deployments/:id */
async function getDeployment(
  deploymentId: string,
  supabase: ReturnType<typeof createClient>,
  ownerId: string
): Promise<Response> {
  if (!isUUID(deploymentId)) {
    return apiError("Invalid deployment id – must be a UUID", 400, "invalid_param");
  }

  const { data, error } = await supabase
    .from("agent_deployments")
    .select("id, campaign_id, status, config, error_message, deployed_at, stopped_at, created_at, updated_at")
    .eq("id", deploymentId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    console.error("getDeployment DB error:", error);
    return apiError("Failed to retrieve deployment", 500, "db_error");
  }
  if (!data) {
    return apiError("Deployment not found", 404, "not_found");
  }

  return json({ data: shapeDeployment(data) });
}

/** GET /api/v1/trials/:id */
async function getTrial(
  trialId: string,
  supabase: ReturnType<typeof createClient>,
  ownerId: string
): Promise<Response> {
  if (!isUUID(trialId)) {
    return apiError("Invalid trial id – must be a UUID", 400, "invalid_param");
  }

  const { data: trial, error: trialError } = await supabase
    .from("agent_trials")
    .select("id, campaign_id, call_id, status, phone, config, created_at, updated_at")
    .eq("id", trialId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (trialError) {
    console.error("getTrial DB error:", trialError);
    return apiError("Failed to retrieve trial", 500, "db_error");
  }
  if (!trial) {
    return apiError("Trial not found", 404, "not_found");
  }

  // Fetch the underlying call record if one was created
  let call: Record<string, unknown> | null = null;
  if (trial.call_id) {
    const { data: callData, error: callError } = await supabase
      .from("calls")
      .select("id, status, started_at, ended_at, duration_seconds, provider_call_id")
      .eq("id", trial.call_id as string)
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (callError) {
      console.error("getTrial call lookup error:", callError);
      // Non-fatal: return trial without call detail rather than failing entirely
    } else {
      call = callData;
    }
  }

  return json({ data: shapeTrial(trial, call) });
}

// ─── Router ───────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // OPTIONS pre-flight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url     = new URL(req.url);
  const path    = url.pathname;
  const method  = req.method;

  // Strip the function path prefix that Supabase injects
  // (e.g. /servexa-api/api/v1/... → /api/v1/...)
  const stripped = path.replace(/^\/servexa-api/, "");

  // Only handle /api/v1/* paths
  if (!stripped.startsWith(API_PREFIX)) {
    return apiError(`Not found. Use ${API_PREFIX}/...`, 404, "not_found");
  }

  // ── Build service-role Supabase client (internal use only) ────────────────
  const supabaseUrl        = Deno.env.get("SUPABASE_URL")              as string;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

  if (!supabaseUrl || !supabaseServiceKey) {
    return apiError("Server configuration error", 500, "server_error");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ── Authenticate ─────────────────────────────────────────────────────────
  const authResult = await resolveApiKey(req, supabase);
  if (authResult.error) return authResult.error;

  const { key } = authResult;
  const ownerId  = key.owner_id;
  const apiKeyId = key.id;

  // ── Route matching ────────────────────────────────────────────────────────
  const routePath = stripped.slice(API_PREFIX.length); // e.g. /agents, /agents/uuid/trials

  const segments = routePath.split("/").filter(Boolean);
  // segments examples:
  //  ["agents"]
  //  ["agents", "uuid"]
  //  ["agents", "uuid", "trials"]
  //  ["agents", "uuid", "deploy"]
  //  ["deployments", "uuid"]

  try {
    // GET /agents
    if (method === "GET" && segments[0] === "agents" && segments.length === 1) {
      return await listAgents(req, supabase, ownerId);
    }

    // GET /agents/:id
    if (method === "GET" && segments[0] === "agents" && segments.length === 2) {
      return await getAgent(segments[1], supabase, ownerId);
    }

    // POST /agents/:id/trials
    if (method === "POST" && segments[0] === "agents" && segments[2] === "trials" && segments.length === 3) {
      return await startTrial(req, segments[1], supabase, ownerId, apiKeyId);
    }

    // POST /agents/:id/deploy
    if (method === "POST" && segments[0] === "agents" && segments[2] === "deploy" && segments.length === 3) {
      return await deployAgent(req, segments[1], supabase, ownerId, apiKeyId);
    }

    // GET /trials/:id
    if (method === "GET" && segments[0] === "trials" && segments.length === 2) {
      return await getTrial(segments[1], supabase, ownerId);
    }

    // GET /deployments/:id
    if (method === "GET" && segments[0] === "deployments" && segments.length === 2) {
      return await getDeployment(segments[1], supabase, ownerId);
    }

    return apiError(`Route not found: ${method} ${routePath}`, 404, "not_found");
  } catch (err) {
    console.error("servexa-api unhandled error:", err);
    return apiError("Unexpected server error", 500, "server_error");
  }
});
