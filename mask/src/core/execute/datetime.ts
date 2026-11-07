/** Parsing and coarsening of dates and timestamps. Output forms follow the challenge conventions. */

export type DateResolution = "15min" | "hour" | "day" | "week" | "month" | "year";

export interface ParsedDate { y: number; m: number; d: number; hh: number; mm: number; hasTime: boolean }

const ISO = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\s*$/;
const FI = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(?:klo\s+)?(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?\s*$/;

function daysInMonth(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

export function parseDate(v: string): ParsedDate | null {
  let y: number, m: number, d: number, hh = 0, mm = 0, hasTime = false;
  let g = ISO.exec(v);
  if (g) {
    y = +g[1]!; m = +g[2]!; d = +g[3]!;
    if (g[4] !== undefined) { hh = +g[4]; mm = +g[5]!; hasTime = true; }
  } else {
    g = FI.exec(v);
    if (!g) return null;
    d = +g[1]!; m = +g[2]!; y = +g[3]!;
    if (g[4] !== undefined) { hh = +g[4]; mm = +g[5]!; hasTime = true; }
  }
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m) || hh > 23 || mm > 59) return null;
  return { y, m, d, hh, mm, hasTime };
}

const p2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

export function isoWeek(y: number, m: number, d: number): { year: number; week: number } {
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

export function formatDate(p: ParsedDate, res: DateResolution): string {
  const day = `${p.y}-${p2(p.m)}-${p2(p.d)}`;
  // a date without a time is never given invented precision
  if (!p.hasTime && (res === "15min" || res === "hour")) return day;
  switch (res) {
    case "15min": return `${day} ${p2(p.hh)}:${p2(Math.floor(p.mm / 15) * 15)}`;
    case "hour": return `${day} ${p2(p.hh)}:00`;
    case "day": return day;
    case "week": { const w = isoWeek(p.y, p.m, p.d); return `${w.year}-W${p2(w.week)}`; }
    case "month": return `${p.y}-${p2(p.m)}`;
    case "year": return String(p.y);
  }
}

export function generalizeDate(v: string, res: DateResolution): string | null {
  const p = parseDate(v);
  return p ? formatDate(p, res) : null;
}

/** Shift a parsed date by whole days, keeping the original textual style (ISO or Finnish d.m.yyyy). */
export function shiftDateText(v: string, days: number): string | null {
  const p = parseDate(v);
  if (!p) return null;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate();
  const time = p.hasTime ? ` ${p2(p.hh)}:${p2(p.mm)}` : "";
  if (ISO.test(v)) return `${y}-${p2(m)}-${p2(d)}${time}`;
  return `${d}.${m}.${y}${time}`;
}
