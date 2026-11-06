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
