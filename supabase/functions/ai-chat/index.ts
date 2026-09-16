// Household recipe-chat proxy.
//
// There's no per-user login in this app, so there's no per-user quota to
// hang AI spend on — the household secret that already gates writes (see
// private.household_write_allowed() in Postgres) doubles as this endpoint's
// access gate instead. Anthropic's API key lives only in this function's
// env, never in the client bundle.
//
// Because access is "whoever has the household secret" rather than
// per-user, the safety net here is a single shared, hard, FAIL-CLOSED
// budget: a per-minute request cap (stops a runaway loop/bug from burning
// the whole month's budget in seconds), a per-day request cap, and a
// monthly cost ceiling read from private.ai_usage. Any error while checking
// the budget denies the request — it never falls through to calling the
// model on an ambiguous check.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const HOUSEHOLD_SECRET = Deno.env.get("HOUSEHOLD_SECRET");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Hard caps, tunable via edge function secrets without a redeploy. Defaults
// are deliberately stingy — raise them once you've seen a few weeks of real
// usage and estimated_cost_cents in private.ai_usage.
const MAX_REQUESTS_PER_MINUTE = Number(Deno.env.get("AI_MAX_REQUESTS_PER_MINUTE") ?? "5");
const MAX_REQUESTS_PER_DAY = Number(Deno.env.get("AI_MAX_REQUESTS_PER_DAY") ?? "150");
const MONTHLY_BUDGET_CENTS = Number(Deno.env.get("AI_MONTHLY_BUDGET_CENTS") ?? "300"); // $3.00/mo
const MAX_OUTPUT_TOKENS = Number(Deno.env.get("AI_MAX_OUTPUT_TOKENS") ?? "400");
const MAX_MESSAGE_CHARS = 1500;
const MAX_HISTORY_MESSAGES = 16;

// Cheapest current model on purpose: this is a low-stakes recipe/cooking
// chat, not a task that needs frontier reasoning. Pricing below is Claude
// Haiku 4.5's published per-token rate, used only to estimate spend for the
// budget check — it is not billing-accurate to the cent.
const MODEL = "claude-haiku-4-5";
const INPUT_COST_PER_MTOK_CENTS = 100; // $1.00 / MTok
const OUTPUT_COST_PER_MTOK_CENTS = 500; // $5.00 / MTok

const SYSTEM_PROMPT = `Je bent een korte, behulpzame kookassistent binnen een huishoud-recepten-app.
Beantwoord alleen vragen over recepten, ingrediënten, koken, vervangingen en maaltijdplanning.
Voor iets anders: zeg vriendelijk dat je alleen over eten en koken kan praten.
Houd antwoorden kort (maximaal ~5 zinnen) — dit is een chatvenster, geen essay.`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-household-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type ChatMessage = { role: "user" | "assistant"; text: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!HOUSEHOLD_SECRET || req.headers.get("x-household-secret") !== HOUSEHOLD_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const messages = (body.messages ?? []).slice(-MAX_HISTORY_MESSAGES);
  const last = messages[messages.length - 1];
  if (messages.length === 0 || last.role !== "user" || !last.text?.trim()) {
    return json({ error: "messages must be non-empty and end with a user message" }, 400);
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // --- Budget check: fail closed. ---
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();

  const [perMinuteRes, perDayRes, monthRes] = await Promise.all([
    supabase.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", since(60_000)),
    supabase.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", since(86_400_000)),
    supabase.from("ai_usage").select("estimated_cost_cents").gte("created_at", monthStart),
  ]);

  if (perMinuteRes.error || perDayRes.error || monthRes.error) {
    return json({ error: "budget check failed, try again later" }, 500);
  }
  if ((perMinuteRes.count ?? 0) >= MAX_REQUESTS_PER_MINUTE) {
    return json({ error: "too many requests, slow down a moment" }, 429);
  }
  if ((perDayRes.count ?? 0) >= MAX_REQUESTS_PER_DAY) {
    return json({ error: "daily chat limit reached, try again tomorrow" }, 429);
  }
  const spentThisMonth = (monthRes.data ?? []).reduce((sum, r) => sum + Number(r.estimated_cost_cents), 0);
  if (spentThisMonth >= MONTHLY_BUDGET_CENTS) {
    return json({ error: "AI chat budget for this month is used up" }, 429);
  }

  // --- Call the model. ---
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role,
        content: (m.text ?? "").slice(0, MAX_MESSAGE_CHARS),
      })),
    });
  } catch (err) {
    console.error("anthropic request failed", err);
    return json({ error: "AI request failed, try again later" }, 502);
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const estimatedCostCents =
    (inputTokens / 1_000_000) * INPUT_COST_PER_MTOK_CENTS + (outputTokens / 1_000_000) * OUTPUT_COST_PER_MTOK_CENTS;

  const { error: logError } = await supabase.from("ai_usage").insert({
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_cents: estimatedCostCents,
  });
  if (logError) console.error("failed to log ai_usage", logError);

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  return json({ reply: text });
});
