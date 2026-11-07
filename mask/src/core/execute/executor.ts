/**
 * PlanExecutor: applies every selected decision of a proposal to the imported tables, deterministically.
 * Nothing here persists a token map or the session key; per-run memo caches are discarded on return.
 */
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import type { Decision, DecisionUnit, DatasetManifest, OutputColumn, Proposal, RecipeId, RecipeParams, SpanDetection, SpanLabel } from "@/contracts";
import { columnKey } from "@/contracts";
import type { TableData } from "@/core/session/types";
import { hashOf, sha256Hex } from "@/core/util/hash";
import type { ExecutedPlan, ExecutedTable, ExecutionInput, PlanExecutor, TextCellChange } from "./types";
import { toCsv } from "./csv";
import { generalizeDate, type DateResolution } from "./datetime";
import { ageAt, ageBand, parseHetu } from "./hetu";
import { makeSurrogate, SURROGATE_LABELS } from "./surrogates";

const enc = new TextEncoder();
const HEX = "0123456789abcdef";
function hexPrefix(bytes: Uint8Array, nHex: number): string {
  let s = "";
  for (let i = 0; s.length < nHex; i++) { const b = bytes[i]!; s += HEX[b >> 4]! + HEX[b & 15]!; }
  return s.slice(0, nHex);
}

type Hmac = ReturnType<typeof hmac.create>;

/** HMAC keyed by a sub-key derived from the session key for one purpose; cloned per message (keeps the padded key state). */
function keyedHmac(sessionKey: Uint8Array, purpose: string): Hmac {
  return hmac.create(sha256, hmac(sha256, sessionKey, enc.encode(`mask/${purpose}/v1`)));
}

export interface UnitDecision { unit: DecisionUnit; decision: Decision | undefined }

/** Lookups shared by the executor and the evaluator. */
export function planIndex(proposal: Proposal) {
  const decisions = new Map(proposal.decisions.map((d) => [d.unitId, d]));
  const fieldUnit = new Map<string, UnitDecision>();
  const spanUnits = new Map<string, Map<SpanLabel, UnitDecision>>();
  for (const unit of proposal.units) {
    const decision = decisions.get(unit.id);
    if (unit.kind === "span_class") {
      if (!unit.parentUnitId || !unit.spanLabel) continue;
      let m = spanUnits.get(unit.parentUnitId);
      if (!m) spanUnits.set(unit.parentUnitId, (m = new Map()));
      m.set(unit.spanLabel, { unit, decision });
    } else if (unit.kind === "field" || unit.kind === "field_group") {
      for (const ref of unit.refs) fieldUnit.set(columnKey(ref), { unit, decision });
    }
  }
  const tokenScope = new Map<string, string>();
  for (const s of proposal.tokenScopes) for (const ref of s.columns) tokenScope.set(columnKey(ref), s.id);
  return { decisions, fieldUnit, spanUnits, tokenScope };
}

const CONV_NAME = /(conversation|thread|session|ticket|case|chat|call|dialog)/i;

/** Column whose value identifies the conversation/record a text row belongs to (for surrogate consistency). */
export function conversationKeyColumn(t: TableData, manifest: DatasetManifest): string | null {
  const tm = manifest.tables.find((x) => x.name === t.name);
  const unique = (c: string) => { const s = tm?.columns.find((x) => x.name === c)?.stats; return !!s && s.nonEmpty > 0 && s.distinct === s.nonEmpty; };
  const byName = t.columns.find((c) => /_?id$/i.test(c) && CONV_NAME.test(c));
  if (byName) return byName;
  const fk = manifest.relationships.find((r) => r.from.table === t.name && r.to.table !== t.name && t.columns.includes(r.from.column) && !unique(r.from.column));
  if (fk) return fk.from.column;
  const rowKey = t.columns[0];
  const other = t.columns.find((c) => /_id$/i.test(c) && !(c === rowKey && unique(c)) && !unique(c));
  return other ?? null;
}

interface Ctx {
  input: ExecutionInput;
  notes: string[];
  tokenCaches: Map<string, { mac: Hmac; cache: Map<string, string> }>;
  surrogateMac: Hmac;
  seedCache: Map<string, number>;
  spanUnits: Map<string, Map<SpanLabel, UnitDecision>>;
}

function tokenizer(ctx: Ctx, scopeId: string): { mac: Hmac; cache: Map<string, string> } {
  let t = ctx.tokenCaches.get(scopeId);
  if (!t) { t = { mac: keyedHmac(ctx.input.sessionKey, `token/${scopeId}`), cache: new Map() }; ctx.tokenCaches.set(scopeId, t); }
  return t;
}

function tokenizeColumn(ctx: Ctx, col: (string | null)[], scopeId: string, format: string): (string | null)[] {
  const { mac, cache } = tokenizer(ctx, scopeId);
  const out = new Array<string | null>(col.length);
  const prefix = format === "prefix";
  for (let r = 0; r < col.length; r++) {
    const v = col[r];
    if (v === null || v === undefined) { out[r] = null; continue; }
    let hex = cache.get(v);
    if (hex === undefined) {
      const h = mac.clone();
      h.update(enc.encode(v));
      hex = hexPrefix(h.digest(), 12);
      cache.set(v, hex);
    }
    out[r] = prefix ? `${v.slice(0, 2)}_${hex.slice(0, 10)}` : `tok_${hex}`;
  }
  return out;
}

function datetimeColumn(ctx: Ctx, col: (string | null)[], res: DateResolution, label: string): (string | null)[] {
  let bad = 0;
  const memo = new Map<string, string | null>();
  const out = col.map((v) => {
    if (v === null || v.trim() === "") return null;
    let o = memo.get(v);
    if (o === undefined) { o = generalizeDate(v, res); memo.set(v, o); }
    if (o === null) bad++;
    return o;
  });
  if (bad) ctx.notes.push(`${label}: ${bad} value(s) could not be parsed as a date or timestamp and were emptied`);
  return out;
}

export function binLabel(x: number, width: number, topCode: number): string {
  if (topCode > 0 && x >= topCode) return `${topCode}+`;
  const lo = Math.floor(x / width) * width;
  if (Number.isInteger(width) && Number.isInteger(lo)) return `${lo}-${lo + width - 1}`;
  const r = (n: number) => String(Math.round(n * 1e6) / 1e6);
  return `${r(lo)}-${r(lo + width)}`;
}

export function parseNumber(v: string): number | null {
  const s = v.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function numericBinColumn(ctx: Ctx, col: (string | null)[], width: number, topCode: number, label: string): (string | null)[] {
  let bad = 0;
  const out = col.map((v) => {
    if (v === null) return null;
    const n = parseNumber(v);
    if (n === null) { if (v.trim() !== "") bad++; return null; }
    return binLabel(n, width, topCode);
  });
  if (bad) ctx.notes.push(`${label}: ${bad} non-numeric value(s) emptied`);
  return out;
}

function postcodeColumn(ctx: Ctx, col: (string | null)[], digits: number, label: string): (string | null)[] {
  let bad = 0;
  const out = col.map((v) => {
    if (v === null) return null;
    const s = v.trim();
    if (!/^\d{3,10}$/.test(s)) { if (s !== "") bad++; return null; }
    return s.slice(0, digits) + "*".repeat(Math.max(0, s.length - digits));
  });
  if (bad) ctx.notes.push(`${label}: ${bad} value(s) not recognised as postcodes were emptied`);
  return out;
}

function rareCategoryColumn(ctx: Ctx, col: (string | null)[], minGroup: number, label: string): (string | null)[] {
  const counts = new Map<string, number>();
  for (const v of col) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
  let merged = 0;
  for (const n of counts.values()) if (n < minGroup) merged++;
  if (merged) ctx.notes.push(`${label}: ${merged} categor${merged === 1 ? "y" : "ies"} with fewer than ${minGroup} rows merged into 'other'`);
  return col.map((v) => (v === null ? null : (counts.get(v) ?? 0) < minGroup ? "other" : v));
}

function hetuColumns(ctx: Ctx, col: (string | null)[], params: RecipeParams, label: string): { age: (string | null)[]; sex: (string | null)[] } {
  const width = Number(params.ageBandYears ?? 10) || 10;
  const refStr = String(params.referenceDate ?? "2025-12-31");
  const rm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(refStr);
  const ref = rm ? { y: +rm[1]!, m: +rm[2]!, d: +rm[3]! } : { y: 2025, m: 12, d: 31 };
  if (!rm) ctx.notes.push(`${label}: reference date "${refStr}" not ISO; 2025-12-31 used`);
  const age = new Array<string | null>(col.length), sex = new Array<string | null>(col.length);
  let bad = 0;
  for (let r = 0; r < col.length; r++) {
    const v = col[r];
    if (v === null || v === undefined) { age[r] = null; sex[r] = null; continue; }
    const info = parseHetu(v);
    if (!info) { age[r] = null; sex[r] = null; bad++; continue; }
    const a = ageAt(info.birth, ref);
    age[r] = a < 0 ? null : ageBand(a, width, 90);
    sex[r] = info.sex;
  }
  if (bad) ctx.notes.push(`${label}: ${bad} invalid identity code(s) gave empty age band and sex`);
  return { age, sex };
}

/** Span with the decision that applies to it. */
interface PlannedSpan { s: SpanDetection; recipe: RecipeId | null; params: RecipeParams; unitId: string; fallback: boolean }

/** Drop overlapping spans: keep the earliest start, then the longest. */
export function nonOverlapping(spans: SpanDetection[]): SpanDetection[] {
  if (spans.length <= 1) return spans;
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: SpanDetection[] = [];
  let lastEnd = -1;
  for (const s of sorted) { if (s.start >= lastEnd && s.end > s.start) { out.push(s); lastEnd = s.end; } }
  return out;
}

function seedOf(ctx: Ctx, key: string): number {
  let s = ctx.seedCache.get(key);
  if (s === undefined) {
    const h = ctx.surrogateMac.clone();
    h.update(enc.encode(key));
    const d = h.digest();
    s = ((d[0]! << 24) | (d[1]! << 16) | (d[2]! << 8) | d[3]!) >>> 0;
    ctx.seedCache.set(key, s);
  }
  return s;
}

function redactTextColumn(
  ctx: Ctx, t: TableData, column: string, col: (string | null)[], parentUnitId: string, outIndex: number,
  textChanges: Map<string, TextCellChange>,
): (string | null)[] {
  const spanDecisions = ctx.spanUnits.get(parentUnitId) ?? new Map<SpanLabel, UnitDecision>();
  const needsConv = [...spanDecisions.values()].some((u) => u.decision?.selected?.recipeId === "redact_surrogate" && (u.decision.selected.params.consistency ?? "conversation") === "conversation");
  const convCol = needsConv ? conversationKeyColumn(t, ctx.input.manifest) : null;
  const convData = convCol ? t.data[t.columns.indexOf(convCol)] ?? null : null;
  if (needsConv) ctx.notes.push(`${t.name}.${column}: surrogate consistency per conversation uses ${convCol ? `column ${convCol}` : "the row (no conversation key column found)"}`);
  const out = new Array<string | null>(col.length);
  const fallback = new Map<string, number>();
  for (let r = 0; r < col.length; r++) {
    const text = col[r];
    if (text === null || text === undefined || text === "") { out[r] = text ?? null; continue; }
    const raw = ctx.input.spans.get(t.name, column, r);
    if (!raw.length) { out[r] = text; continue; }
    const spans = nonOverlapping(raw.filter((s) => s.start >= 0 && s.end <= text.length));
    const planned: PlannedSpan[] = spans.map((s) => {
      const ud = spanDecisions.get(s.label);
      const sel = ud?.decision?.selected;
      if (!ud || !sel) return { s, recipe: "redact_typed", params: {}, unitId: ud?.unit.id ?? parentUnitId, fallback: true };
      return { s, recipe: sel.recipeId, params: sel.params, unitId: ud.unit.id, fallback: false };
    });
    const pieces: string[] = [];
    const change: TextCellChange = { spans: [] };
    let cursor = 0;
    for (const p of planned) {
      const { s } = p;
      if (p.recipe === "keep") continue;
      pieces.push(text.slice(cursor, s.start));
      const original = text.slice(s.start, s.end);
      let replacement: string;
      let recipe: RecipeId = p.recipe ?? "redact_typed";
      let next = s.end;
      if (p.fallback) fallback.set(s.label, (fallback.get(s.label) ?? 0) + 1);
      if (recipe === "suppress") {
        replacement = "";
        // collapse the double space left behind: drop one following space when the output so far ends in a space (or is empty)
        let last = "";
        for (let i = pieces.length - 1; i >= 0 && last === ""; i--) last = pieces[i]!;
        const prevSpace = last === "" || /\s$/.test(last);
        if (prevSpace && text.charCodeAt(next) === 32) next += 1;
      } else if (recipe === "redact_surrogate") {
        const mode = String(p.params.consistency ?? "conversation");
        const scope = mode === "dataset" ? "d"
          : mode === "none" ? `n:${t.name}:${column}:${r}:${s.start}`
          : convData && convData[r] != null ? `c:${convData[r]}` : `r:${t.name}:${r}`;
        const sur = SURROGATE_LABELS.has(s.label) ? makeSurrogate(s.label, original, (k) => seedOf(ctx, `${scope}\u0000${s.label}\u0000${k}`)) : null;
        if (sur === null) {
          replacement = `[${s.label}]`; recipe = "redact_typed";
          const k = `${s.label} (no surrogate)`; fallback.set(k, (fallback.get(k) ?? 0) + 1);
        } else replacement = sur;
      } else {
        if (recipe !== "redact_typed") { const k = `${s.label} (recipe ${recipe} not valid for spans)`; fallback.set(k, (fallback.get(k) ?? 0) + 1); recipe = "redact_typed"; }
        replacement = `[${s.label}]`;
      }
      pieces.push(replacement);
      change.spans.push({ start: s.start, end: s.end, label: s.label, replacement, unitId: p.unitId, recipeId: recipe });
      cursor = next;
    }
    if (!change.spans.length) { out[r] = text; continue; }
    pieces.push(text.slice(cursor));
    out[r] = pieces.join("");
    textChanges.set(`${outIndex}:${r}`, change);
  }
  for (const [label, n] of fallback) ctx.notes.push(`${t.name}.${column}: ${n} ${label} span(s) had no span decision; typed placeholder used`);
  return out;
}

export function createPlanExecutor(): PlanExecutor {
  return {
    execute(input, onProgress) {
      const t0 = performance.now();
      const idx = planIndex(input.proposal);
      const ctx: Ctx = { input, notes: [], tokenCaches: new Map(), surrogateMac: keyedHmac(input.sessionKey, "surrogate"), seedCache: new Map(), spanUnits: idx.spanUnits };
      const total = input.tables.reduce((n, t) => n + t.columns.length, 0);
      let done = 0;
      const tables: ExecutedTable[] = [];
      {
        for (const t of input.tables) {
          const columns: OutputColumn[] = [];
          const data: (string | null)[][] = [];
          const textChanges = new Map<string, TextCellChange>();
          const push = (c: OutputColumn, d: (string | null)[]) => { columns.push(c); data.push(d); };
          t.columns.forEach((column, ci) => {
            onProgress?.(done++, total, `${t.name}.${column}`);
            const key = `${t.name}.${column}`;
            const col = t.data[ci] ?? new Array<string | null>(t.rowCount).fill(null);
            const ud = idx.fieldUnit.get(key);
            const sel = ud?.decision?.selected;
            const unitId = ud?.unit.id ?? null;
            if (!ud || !sel) {
              ctx.notes.push(`${key}: ${ud ? "no recipe selected (abstained)" : "no decision unit"}; column removed`);
              push({ name: column, sourceColumn: column, unitId, status: "suppressed" }, []);
              return;
            }
            const p = sel.params;
            switch (sel.recipeId) {
              case "keep": push({ name: column, sourceColumn: column, unitId, status: "kept" }, col.slice()); return;
              case "suppress": push({ name: column, sourceColumn: column, unitId, status: "suppressed" }, []); return;
              case "tokenize_keyed": {
                const scopeId = idx.tokenScope.get(key) ?? (p.scope === "table" ? `table:${t.name}` : "dataset");
                push({ name: column, sourceColumn: column, unitId, status: "transformed" }, tokenizeColumn(ctx, col, scopeId, String(p.format ?? "token")));
                return;
              }
              case "redact_text":
                push({ name: column, sourceColumn: column, unitId, status: "transformed" }, redactTextColumn(ctx, t, column, col, ud.unit.id, columns.length, textChanges));
                return;
              case "generalize_datetime":
                push({ name: column, sourceColumn: column, unitId, status: "transformed" }, datetimeColumn(ctx, col, String(p.resolution ?? "hour") as DateResolution, key));
                return;
              case "generalize_numeric_bin":
                push({ name: column, sourceColumn: column, unitId, status: "transformed" }, numericBinColumn(ctx, col, Number(p.width ?? 10) || 10, Number(p.topCode ?? 0) || 0, key));
                return;
              case "generalize_postcode":
                push({ name: column, sourceColumn: column, unitId, status: "transformed" }, postcodeColumn(ctx, col, Number(p.digits ?? 3) || 3, key));
                return;
              case "generalize_category_rare":
                push({ name: column, sourceColumn: column, unitId, status: "transformed" }, rareCategoryColumn(ctx, col, Number(p.minGroup ?? 5) || 5, key));
                return;
              case "derive_hetu": {
                const { age, sex } = hetuColumns(ctx, col, p, key);
                push({ name: `${column}_age_band`, sourceColumn: column, unitId, status: "derived" }, age);
                push({ name: `${column}_sex`, sourceColumn: column, unitId, status: "derived" }, sex);
                ctx.notes.push(`${key}: replaced by derived columns ${column}_age_band and ${column}_sex`);
                return;
              }
              default:
                ctx.notes.push(`${key}: recipe ${sel.recipeId} does not apply to a whole column; column removed`);
                push({ name: column, sourceColumn: column, unitId, status: "suppressed" }, []);
            }
          });
          const live = columns.map((c, i) => ({ c, d: data[i]! })).filter((x) => x.c.status !== "suppressed");
          const csv = toCsv(live.map((x) => x.c.name), live.map((x) => x.d), t.rowCount);
          tables.push({ name: t.name, columns, data, rowCount: t.rowCount, textChanges, sha256: sha256Hex(csv) });
        }
      }
      onProgress?.(total, total, "done");
      const outputHash = hashOf(tables.map((t) => ({ name: t.name, sha256: t.sha256 })));
      return { planHash: input.proposal.planHash, outputHash, tables, durationMs: Math.round(performance.now() - t0), notes: ctx.notes };
    },
  };
}

/** CSV text of an executed table exactly as exported (suppressed columns omitted). */
export function executedTableCsv(t: ExecutedTable): string {
  const live = t.columns.map((c, i) => ({ c, d: t.data[i]! })).filter((x) => x.c.status !== "suppressed");
  return toCsv(live.map((x) => x.c.name), live.map((x) => x.d), t.rowCount);
}

/** A table whose every column is suppressed is withheld: no file is written. */
export const isWithheld = (t: ExecutedTable): boolean => t.columns.every((c) => c.status === "suppressed");

export type { ExecutedPlan };
