// RouteSafe assistant proxy (local only). Turns a planner's free-text question into a TYPED request.
// The model never sees release numbers, private data or the operator's records: it gets the question plus the
// public list of time bands and area names, and may only answer with the schema below. The browser validates the
// request again and computes every number deterministically from the published release.
//
// run:  node web/server/assistant.mjs        (needs Anthropic credentials, e.g. ANTHROPIC_API_KEY in the environment)
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const PORT = Number(process.env.ASSISTANT_PORT ?? 8787);
const MODEL = "claude-opus-5-5";
const ALLOWED_ORIGINS = new Set(["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"]);
const BANDS = ["00-06", "06-09", "09-15", "15-18", "18-24"];

// Public area ids from the synced release geometry (public reference data only).
const web = join(dirname(fileURLToPath(import.meta.url)), "..");
function publicAreas() {
  const dir = join(web, "public", "releases");
  for (const id of existsSync(dir) ? readdirSync(dir) : []) {
    const f = join(dir, id, "public_areas.geojson");
    const m = join(dir, id, "manifest.json");
    if (existsSync(f) && existsSync(m) && !JSON.parse(readFileSync(m, "utf8")).fixture) {
      return JSON.parse(readFileSync(f, "utf8")).features.map((x) => x.properties.area_id);
    }
  }
  throw new Error("no synced public release geometry; run npm run sync first");
}
const AREAS = publicAreas();

const Request = z.object({
  kind: z.enum(["rank_corridors", "individual_history_unavailable", "unsupported_breakdown", "out_of_scope"]),
  hour_band: z.enum(BANDS).nullable(),
  origin_area: z.enum(AREAS).nullable(),
  limit: z.number().int().nullable(),
  note: z.string(),
});

const SYSTEM = `You turn a transport planner's question into ONE typed request for a published, privacy-protected bus-demand release.
You never answer with numbers; the application computes all numbers itself from the release.

The release only supports this view: weekday trips between public areas (origin area -> destination area), summed over a 4-week period, per hour band.
Hour bands: 00-06 night, 06-09 morning, 09-15 midday, 15-18 afternoon, 18-24 evening.
Public areas (ids look like "Turku-205", meaning Turku postcode area 205): ${AREAS.join(", ")}.

Choose kind:
- "rank_corridors": the question asks which routes/corridors/flows are busiest or deserve attention. Set hour_band (default "06-09" if the question names no time), origin_area only if the question names one starting area that is in the list (else null), limit = how many routes asked for (default 3, max 10).
- "individual_history_unavailable": the question asks about one person, one card, one passenger, someone's trips, or anything that would identify or follow an individual.
- "unsupported_breakdown": the question asks for a breakdown the release does not have (routes on a specific date or weekday, routes per bus line, capacity, crowding, delays, ticket types, ages, exact times).
- "out_of_scope": anything else.
For every kind other than rank_corridors set hour_band, origin_area and limit to null.
note: one short plain-English sentence saying how you interpreted the question. No numbers about trips.`;

let client = null;
let credentialError = "not checked yet";
try { client = new Anthropic(); } catch (e) { credentialError = String(e?.message ?? e); }
let verified = false;
// One free metadata call proves the credentials work before the UI says "AI on" (no tokens are used).
async function verify() {
  if (!client) return;
  try { await client.models.retrieve(MODEL); verified = true; credentialError = null; }
  catch (e) { verified = false; credentialError = e instanceof Anthropic.AuthenticationError ? "credentials rejected" : `credentials missing or API unreachable (${e?.constructor?.name ?? "error"})`; }
}

async function propose(question) {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: zodOutputFormat(Request) },
    system: SYSTEM,
    messages: [{ role: "user", content: question }],
  });
  if (response.stop_reason === "refusal") return { kind: "ai_unavailable", note: "The model declined this question." };
  const out = response.parsed_output;
  if (!out) return { kind: "invalid_intent", note: "The model did not return a valid request." };
  console.log(`[assistant] ${new Date().toISOString()} kind=${out.kind} in=${response.usage?.input_tokens} out=${response.usage?.output_tokens}`);
  if (out.kind !== "rank_corridors") return { kind: out.kind, note: out.note };
  const limit = Math.min(10, Math.max(1, out.limit ?? 3));
  return { kind: "intent", note: out.note, intent: { view: "od", hour_band: out.hour_band ?? "06-09", origin_area: out.origin_area, action: "rank_corridors", limit } };
}

let last = 0;
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin ?? "";
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Vary", "Origin");
  }
  const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method === "OPTIONS") return send(204, {});
  if (req.method === "GET" && req.url === "/health") return send(200, verified ? { ok: true, model: MODEL } : { ok: false, reason: credentialError });
  if (req.method !== "POST" || req.url !== "/intent") return send(404, { error: "not_found" });
  if (!ALLOWED_ORIGINS.has(origin)) return send(403, { error: "origin_not_allowed" });
  if (!client || !verified) return send(503, { kind: "ai_unavailable", note: "No working Anthropic credentials on this machine." });
  if (Date.now() - last < 800) return send(429, { kind: "ai_unavailable", note: "One question at a time, please." });
  last = Date.now();
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > 4000) return send(413, { error: "too_large" }); }
  let question = "";
  try { question = String(JSON.parse(body).question ?? "").slice(0, 400).trim(); } catch { return send(400, { error: "bad_json" }); }
  if (!question) return send(400, { error: "empty_question" });
  try {
    return send(200, await propose(question));
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return send(503, { kind: "ai_unavailable", note: "The API key was rejected." });
    if (error instanceof Anthropic.RateLimitError) return send(503, { kind: "ai_unavailable", note: "Rate limited, try again shortly." });
    if (error instanceof Anthropic.APIError) return send(502, { kind: "ai_unavailable", note: `Model service error ${error.status}.` });
    return send(502, { kind: "ai_unavailable", note: "Model service unreachable." });
  }
});
server.listen(PORT, "127.0.0.1", async () => {
  await verify();
  console.log(`[assistant] http://127.0.0.1:${PORT} model=${MODEL} credentials=${verified ? "verified" : credentialError}`);
});
