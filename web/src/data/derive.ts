// Pure, deterministic views over ALREADY RELEASED values: filtering, sorting and summing only.
// No function here can create a new statistic, combine marginal tables into a joint one, or touch private data.
import type { DailyCell, LineHourCell, OdCell, Release } from "./release";

export const BANDS = ["00-06", "06-09", "09-15", "15-18", "18-24"] as const;
export const BAND_LABEL: Record<string, string> = {
  "00-06": "Night 00–06", "06-09": "Morning 06–09", "09-15": "Midday 09–15", "15-18": "Afternoon 15–18", "18-24": "Evening 18–24",
};

export function weekdaysInPeriod(rel: Release): number {
  const d = new Date(rel.manifest.period.start_date + "T00:00:00Z");
  const end = new Date(rel.manifest.period.end_date_inclusive + "T00:00:00Z");
  let n = 0;
  while (d <= end) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; d.setUTCDate(d.getUTCDate() + 1); }
  return n;
}

export interface Corridor extends OdCell { rank: number; id: string }

export const corridorId = (c: Pick<OdCell, "origin_area" | "destination_area" | "hour_band">) =>
  `od:${c.origin_area}>${c.destination_area}@${c.hour_band}`;

/** Ordered, non-self area pairs in one hour band, ranked by the released display estimate. */
export function rankCorridors(rel: Release, band: string, origin: string | null = null): Corridor[] {
  return rel.od
    .filter((c) => c.hour_band === band && c.origin_area !== c.destination_area && (!origin || c.origin_area === origin))
    .sort((a, b) => b.trips - a.trips || a.origin_area.localeCompare(b.origin_area) || a.destination_area.localeCompare(b.destination_area))
    .map((c, i) => ({ ...c, rank: i + 1, id: corridorId(c) }));
}

/** Released journeys starting in each area for one band (excluding same-area journeys); used for dot size only. */
export function outgoingByArea(rel: Release, band: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of rel.od) if (c.hour_band === band && c.origin_area !== c.destination_area) m.set(c.origin_area, (m.get(c.origin_area) ?? 0) + c.trips);
  return m;
}

export function lineTotals(rel: Release): { line: string; total: number; cells: LineHourCell[] }[] {
  const by = new Map<string, LineHourCell[]>();
  for (const c of rel.lineHour) by.set(c.line, [...(by.get(c.line) ?? []), c]);
  return [...by].map(([line, cells]) => ({ line, cells: cells.sort((a, b) => a.hour - b.hour), total: cells.reduce((s, c) => s + c.boardings, 0) }))
    .sort((a, b) => (a.line === "unknown" ? 1 : b.line === "unknown" ? -1 : b.total - a.total));
}

export function dailySeries(rel: Release): (DailyCell & { weekday: number })[] {
  return [...rel.daily].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, weekday: new Date(d.date + "T00:00:00Z").getUTCDay() }));
}

export const fmt = (n: number) => new Intl.NumberFormat("en-GB").format(Math.round(n));

// ---------------------------------------------------------------- derived municipality view (A-004 proposal)
// Post-processing of the SAME immutable release: for each (origin municipality, destination municipality, band), sum the
// released SIGNED estimates (noisy_value) of the 21-area cells, then clamp at zero. No new draw, no private data, no
// reuse of single-cell intervals. Summing already-clamped `trips` would add bias, so it is deliberately not done.
export type Level = "area" | "municipality";

export interface Point { id: string; label: string; lon: number; lat: number }

export function municipalityOf(rel: Release): Map<string, string> {
  return new Map(rel.areas.map((a) => [a.id, a.municipality]));
}

export function points(rel: Release, level: Level): Point[] {
  if (level === "area") return rel.areas.map((a) => ({ id: a.id, label: a.id, lon: a.lon, lat: a.lat }));
  const by = new Map<string, { lon: number; lat: number; n: number }>();
  for (const a of rel.areas) {
    const g = by.get(a.municipality) ?? { lon: 0, lat: 0, n: 0 };
    by.set(a.municipality, { lon: g.lon + a.lon, lat: g.lat + a.lat, n: g.n + 1 });
  }
  // unweighted mean of the public area points (themselves unweighted stop centroids)
  return [...by].map(([m, g]) => ({ id: m, label: m, lon: g.lon / g.n, lat: g.lat / g.n }));
}

export function municipalityCells(rel: Release): OdCell[] {
  const muni = municipalityOf(rel);
  const sums = new Map<string, { o: string; d: string; b: string; signed: number; status: Set<string> }>();
  for (const c of rel.od) {
    const o = muni.get(c.origin_area)!, d = muni.get(c.destination_area)!;
    const k = `${o}|${d}|${c.hour_band}`;
    const s = sums.get(k) ?? { o, d, b: c.hour_band, signed: 0, status: new Set<string>() };
    s.signed += c.noisy_value;
    s.status.add(c.evidence_status);
    sums.set(k, s);
  }
  return [...sums.values()].map((s) => ({
    origin_area: s.o, destination_area: s.d, hour_band: s.b, trips: Math.max(0, s.signed), noisy_value: s.signed,
    noise_lower: null, noise_upper: null, evidence_status: s.status.size === 1 ? [...s.status][0] : "uncertain",
  }));
}

export function rankAt(rel: Release, level: Level, band: string, origin: string | null): Corridor[] {
  const cells = level === "area" ? rel.od : municipalityCells(rel);
  return cells
    .filter((c) => c.hour_band === band && c.origin_area !== c.destination_area && (!origin || c.origin_area === origin))
    .sort((a, b) => b.trips - a.trips || a.origin_area.localeCompare(b.origin_area) || a.destination_area.localeCompare(b.destination_area))
    .map((c, i) => ({ ...c, rank: i + 1, id: (level === "area" ? "od:" : "odm:") + `${c.origin_area}>${c.destination_area}@${c.hour_band}` }));
}

export function outgoingAt(rel: Release, level: Level, band: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of level === "area" ? rel.od : municipalityCells(rel)) {
    if (c.hour_band === band && c.origin_area !== c.destination_area) m.set(c.origin_area, (m.get(c.origin_area) ?? 0) + c.trips);
  }
  return m;
}
