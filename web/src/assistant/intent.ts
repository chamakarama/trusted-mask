// Bounded planning assistant (INTERFACES.md §5). A model may only PROPOSE an intent; this module validates it and a
// deterministic executor answers from released values. Unsupported requests get typed refusals with an alternative.
import { BANDS, BAND_LABEL, fmt, rangeOf, rankCorridors, shortlistReliability, weekdaysInPeriod } from "../data/derive";
import { areaLabel, type Release } from "../data/release";

export interface Intent { view: "od"; hour_band: string; origin_area: string | null; action: "rank_corridors"; limit: number }
export type Refusal = "unsupported_breakdown" | "individual_history_unavailable" | "ai_unavailable" | "invalid_intent" | "out_of_scope";

export interface Evidence { n: number; result_id: string; text: string }
export interface Answer {
  kind: "answer" | Refusal;
  release_id: string;
  definition_id?: string;
  units?: string;
  summary: string;
  evidence: Evidence[];
  warnings: string[];
  alternative?: Intent;
  source: "preset" | "model";
  request?: Intent;          // the checked request the numbers were computed from (shown as "Read as …")
}

const KEYS = ["view", "hour_band", "origin_area", "action", "limit"];

export function validateIntent(x: unknown, rel: Release): { ok: true; intent: Intent } | { ok: false; reason: string } {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return { ok: false, reason: "intent must be an object" };
  const o = x as Record<string, unknown>;
  const extra = Object.keys(o).filter((k) => !KEYS.includes(k));
  if (extra.length) return { ok: false, reason: `additional properties rejected: ${extra.join(", ")}` };
  if (o.view !== "od") return { ok: false, reason: "view must be 'od'" };
  if (o.action !== "rank_corridors") return { ok: false, reason: "action must be 'rank_corridors'" };
  if (typeof o.hour_band !== "string" || !(BANDS as readonly string[]).includes(o.hour_band)) return { ok: false, reason: "hour_band must be a released band" };
  if (o.origin_area !== null && (typeof o.origin_area !== "string" || !rel.areas.some((a) => a.id === o.origin_area))) return { ok: false, reason: "origin_area must be null or a public area id" };
  if (typeof o.limit !== "number" || !Number.isInteger(o.limit) || o.limit < 1 || o.limit > 10) return { ok: false, reason: "limit must be an integer 1-10" };
  return { ok: true, intent: o as unknown as Intent };
}

export function execute(intent: Intent, rel: Release, source: "preset" | "model"): Answer {
  const all = rankCorridors(rel, intent.hour_band, intent.origin_area);
  const rows = all.slice(0, intent.limit);
  const days = weekdaysInPeriod(rel);
  const rely = rel.manifest.fixture ? null : shortlistReliability(rel, all, intent.limit);
  const def = rel.manifest.families.od.definition_id;
  const warnings = [
    "Destinations are estimated from where the same card next starts a journey, not observed.",
    rely
      ? `Noise ranges hold for all ${fmt(rely.candidates)} released route numbers at once (95%, only the noise around the capped counts). The per-card cap can reduce counts, and noise and the cap can reorder routes.`
      : "Numbers are protected estimates, so close numbers can swap places.",
  ];
  if (rely?.noiseOnly.length) warnings.unshift(`Could be pure noise: across all ${fmt(rely.candidates)} released route numbers, noise alone can lift an empty route to about ${fmt(rely.radius)} trips. Don't decide on these.`);
  if (rel.manifest.fixture) warnings.unshift("Fixture release: illustrative values, not results.");
  const scope = intent.origin_area ? ` starting in ${areaLabel(intent.origin_area)}` : "";
  return {
    kind: "answer", release_id: rel.id, definition_id: def, units: "inferred weekday journeys, whole release period", source, warnings, request: intent,
    summary: rows.length
      ? `Top ${rows.length} ${BAND_LABEL[intent.hour_band].toLowerCase()} routes${scope}:`
      : `No published route${scope} in this time band.`,
    evidence: rows.map((c, i) => ({
      n: i + 1, result_id: c.id,
      text: `${areaLabel(c.origin_area)} → ${areaLabel(c.destination_area)}: ${fmt(c.trips)} trips${rely ? `, noise range ${fmt(rangeOf(c.noisy_value, rely.radius)[0])}–${fmt(rangeOf(c.noisy_value, rely.radius)[1])}` : ""} (about ${fmt(c.trips / days)} per weekday)`,
    })),
  };
}

export function refuse(kind: Refusal, rel: Release, why: string): Answer {
  const alternative: Intent = { view: "od", hour_band: "06-09", origin_area: null, action: "rank_corridors", limit: 3 };
  return { kind, release_id: rel.id, summary: why, evidence: [], warnings: [], alternative, source: "preset" };
}

export interface Preset { id: string; question: string; run: (rel: Release) => Answer }

export const PRESETS: Preset[] = [
  { id: "morning", question: "Busiest morning routes?",
    run: (rel) => execute({ view: "od", hour_band: "06-09", origin_area: null, action: "rank_corridors", limit: 3 }, rel, "preset") },
  { id: "evening", question: "Busiest evening routes?",
    run: (rel) => execute({ view: "od", hour_band: "18-24", origin_area: null, action: "rank_corridors", limit: 3 }, rel, "preset") },
  { id: "history", question: "Show one passenger's trips",
    run: (rel) => refuse("individual_history_unavailable", rel,
      "This release has no travel cards or journeys in it, only protected totals, so nobody's trips can be shown.") },
  { id: "daily-od", question: "Trips from Turku area 208 to Raisio on 15 Oct?",
    run: (rel) => refuse("unsupported_breakdown", rel,
      "Routes are only published for the whole 4 weeks, not per day. Combining tables would make up numbers that were never protected.") },
];
