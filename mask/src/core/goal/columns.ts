/**
 * Matching words in the goal text to column names. Deliberately literal: a column matches only when its
 * name tokens appear in the phrase ("handle time" ↔ handle_time_s, "per customer" ↔ customer_id).
 * Synonyms such as "contact reason" ↔ intent are NOT inferred here.
 */
import type { DatasetManifest } from "@/contracts";
import { normalizeText, wordTokens } from "./text";

export interface ColumnInfo { table?: string; column: string; required: string[]; all: string[] }

/** Unit or format suffixes that carry no meaning for matching. */
const DROP_TOKENS = new Set(["s", "ms", "eur", "utc", "kw", "m2", "pct", "nrs", "c", "a", "kb", "dbm", "m"]);
/** Tokens a phrase may omit ("by school" ↔ school_code, "per customer" ↔ customer_id). */
const OPTIONAL_TOKENS = new Set(["id", "code", "flag", "count", "ref"]);
const TOKEN_ALIASES: Record<string, string> = { ts: "time", dt: "date", qty: "quantity", lang: "language", addr: "address" };
/** Single-word column names too generic to count as a mention on their own. */
const GENERIC = new Set(["id", "value", "unit", "name", "seq", "split", "result", "action", "method", "direction", "quality", "answer", "query", "type", "week", "visits", "lines", "area", "zone", "city", "message", "time", "date"]);

export function singular(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) return t.slice(0, -1);
  return t;
}

export function columnTokens(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9äöå]+/)
    .filter(Boolean)
    .filter((t) => !DROP_TOKENS.has(t))
    .map((t) => TOKEN_ALIASES[t] ?? t);
}

export function columnInfo(column: string, table?: string): ColumnInfo {
  const all = columnTokens(column);
  const required = all.filter((t) => !OPTIONAL_TOKENS.has(t));
  return { table, column, all, required: required.length ? required : all };
}

export function columnsOfManifest(manifest: DatasetManifest): ColumnInfo[] {
  return manifest.tables.flatMap((t) => t.columns.map((c) => columnInfo(c.name, t.name)));
}

/** Columns from bare or "table.column" names (used when a scenario stands in for the manifest). */
export function columnsOfNames(names: string[]): ColumnInfo[] {
  return names.map((n) => {
    const i = n.indexOf(".");
    return i > 0 ? columnInfo(n.slice(i + 1), n.slice(0, i)) : columnInfo(n);
  });
}

function phraseTokenSet(phrase: string): Set<string> {
  const toks = wordTokens(phrase).flatMap((t) => t.split(/[-_]/)).filter(Boolean);
  return new Set(toks.flatMap((t) => [t, singular(t), TOKEN_ALIASES[t] ?? t]));
}

/** Column names (bare) whose required name tokens all appear in the phrase; keeps the most specific matches. */
export function matchPhraseToColumns(phrase: string, cols: ColumnInfo[]): string[] {
  const set = phraseTokenSet(phrase);
  let best = 0;
  let out: string[] = [];
  for (const c of cols) {
    if (!c.required.length || !c.required.every((t) => set.has(t))) continue;
    const score = c.all.filter((t) => set.has(t)).length + c.required.length;
    if (score > best) { best = score; out = [c.column]; } else if (score === best && !out.includes(c.column)) out.push(c.column);
  }
  return out;
}

/** Columns whose name appears in the text as a contiguous word sequence (generic single words excluded). */
export function mentionedColumns(text: string, cols: ColumnInfo[]): string[] {
  const toks = wordTokens(normalizeText(text)).flatMap((t) => t.split(/[-_]/)).filter(Boolean).map(singular);
  const out: string[] = [];
  for (const c of cols) {
    const req = c.required.map(singular);
    if (!req.length) continue;
    if (req.length === 1 && (GENERIC.has(c.column.toLowerCase()) || GENERIC.has(req[0]!) || req[0]!.length < 3)) continue;
    for (let i = 0; i + req.length <= toks.length; i++) {
      if (req.every((t, j) => toks[i + j] === t)) { if (!out.includes(c.column)) out.push(c.column); break; }
    }
  }
  return out;
}

/** Keep only names that exist in the column list (bare name or table.column). */
export function filterToColumns(names: string[], cols: ColumnInfo[]): string[] {
  const bare = new Set(cols.map((c) => c.column.toLowerCase()));
  const qual = new Set(cols.filter((c) => c.table).map((c) => `${c.table}.${c.column}`.toLowerCase()));
  return names.filter((n) => bare.has(n.toLowerCase()) || qual.has(n.toLowerCase()) || bare.has(n.split(".").pop()!.toLowerCase()));
}
