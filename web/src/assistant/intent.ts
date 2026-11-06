// Bounded planning assistant (INTERFACES.md §5). A model may only PROPOSE an intent; this module validates it and a
// deterministic executor answers from released values. Unsupported requests get typed refusals with an alternative.
import { BANDS, BAND_LABEL, fmt, rankCorridors, weekdaysInPeriod } from "../data/derive";
import { areaLabel, type Release } from "../data/release";

export interface Intent { view: "od"; hour_band: string; origin_area: string | null; action: "rank_corridors"; limit: number }
export type Refusal = "unsupported_breakdown" | "individual_history_unavailable" | "ai_unavailable" | "invalid_intent";

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
  const rows = rankCorridors(rel, intent.hour_band, intent.origin_area).slice(0, intent.limit);
  const days = weekdaysInPeriod(rel);
  const def = rel.manifest.families.od.definition_id;
  const warnings = [
    "Destinations are inferred from the next boarding, not observed.",
    "All E1 cells are uncertain: noise intervals are not yet available, so close values may swap places.",
  ];
  if (rel.manifest.fixture) warnings.unshift("Fixture release: illustrative values, not results.");
  const scope = intent.origin_area ? ` starting in ${areaLabel(intent.origin_area)}` : "";
  return {
    kind: "answer", release_id: rel.id, definition_id: def, units: "inferred weekday journeys, whole release period", source, warnings,
    summary: rows.length
      ? `Top ${rows.length} ${BAND_LABEL[intent.hour_band].toLowerCase()} corridors${scope}, ranked by the released estimate.`
      : `No released corridor${scope} in this band.`,
    evidence: rows.map((c, i) => ({
      n: i + 1, result_id: c.id,
      text: `${areaLabel(c.origin_area)} → ${areaLabel(c.destination_area)}: ${fmt(c.trips)} inferred weekday journeys over the period (≈ ${fmt(c.trips / days)} per weekday; ${c.evidence_status}).`,
    })),
  };
}

export function refuse(kind: Refusal, rel: Release, why: string): Answer {
  const alternative: Intent = { view: "od", hour_band: "06-09", origin_area: null, action: "rank_corridors", limit: 3 };
  return { kind, release_id: rel.id, summary: why, evidence: [], warnings: [], alternative, source: "preset" };
}

export interface Preset { id: string; question: string; run: (rel: Release) => Answer }

export const PRESETS: Preset[] = [
  { id: "morning", question: "Which weekday morning corridors deserve a closer look?",
    run: (rel) => execute({ view: "od", hour_band: "06-09", origin_area: null, action: "rank_corridors", limit: 3 }, rel, "preset") },
  { id: "evening", question: "Where are the strongest evening (18–24) flows?",
    run: (rel) => execute({ view: "od", hour_band: "18-24", origin_area: null, action: "rank_corridors", limit: 3 }, rel, "preset") },
  { id: "history", question: "Show me the journeys of one passenger.",
    run: (rel) => refuse("individual_history_unavailable", rel,
      "This release contains no travel cards, rows or journey chains, so no individual history can be shown. It only holds protected counts between areas. Here is what it can answer instead.") },
  { id: "daily-od", question: "How many trips went from Turku 208 to Raisio on 15 October?",
    run: (rel) => refuse("unsupported_breakdown", rel,
      "Corridors are released for the whole period only, not per day, and the daily table has no areas. Combining the two would invent a breakdown that was never measured or protected.") },
];
