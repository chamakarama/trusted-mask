/**
 * JointEvaluator: measures the complete executed plan. Every metric says what it is measured against (basis).
 * There is no combined score. Metric details carry column names and counts only, never cell values.
 */
import type { Evaluation, FieldDetection, ThreatCoverage, GoalSpec, MetricResult, RecipeId, SpanLabel, TimeResolution } from "@/contracts";
import { HARD_SPAN_LABELS } from "@/contracts";
import type { TableData } from "@/core/session/types";
import { newId, nowIso } from "@/core/util/hash";
import type { ExecutedTable } from "@/core/execute/types";
import { planIndex, parseNumber } from "@/core/execute";
import { nonOverlapping } from "@/core/execute/executor";
import type { EvaluationInput, JointEvaluator } from "./types";

const SAMPLE = 20000;
const K = 5;
const WORD = /[a-zåäöéü]{3,}/g;
const HARD = new Set<SpanLabel>(HARD_SPAN_LABELS);
const TIME_ORDER: TimeResolution[] = ["exact", "minute", "15min", "hour", "day", "week", "month", "year"];

/** Deterministic stride sample of row indices. */
export function sampleRows(n: number, max = SAMPLE): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = n / max;
  return Array.from({ length: max }, (_, i) => Math.floor(i * step));
}

type M = Omit<MetricResult, "status" | "passed" | "value"> & { value: number | null; status?: MetricResult["status"]; passed?: boolean | null };

function finish(m: M): MetricResult {
  const status = m.status ?? (m.value === null ? "not_applicable" : "evaluated");
  let passed: boolean | null = m.passed ?? null;
  if (m.passed === undefined && m.threshold && m.value !== null && status === "evaluated") {
    const { op, value } = m.threshold;
    const v = m.value;
    passed = op === "<=" ? v <= value + 1e-12 : op === ">=" ? v >= value - 1e-12 : op === "<" ? v < value : v > value;
  }
  return { ...m, status, passed, value: m.value };
}

const round = (x: number, d = 6): number => Math.round(x * 10 ** d) / 10 ** d;

export function createJointEvaluator(): JointEvaluator {
  return { evaluate };
}

function evaluate(input: EvaluationInput, onProgress?: (done: number, total: number, message?: string) => void): Evaluation {
  const t0 = performance.now();
  const { original, executed, goal, proposal, detections } = input;
  const idx = planIndex(proposal);
  const metrics: MetricResult[] = [];
  const unsupported: string[] = [];
  const det = new Map(detections.fields.map((d) => [`${d.ref.table}.${d.ref.column}`, d]));
  const outTable = new Map(executed.tables.map((t) => [t.name, t]));
  const origTable = new Map(original.map((t) => [t.name, t]));
  const recipeOf = (table: string, column: string): RecipeId | null => idx.fieldUnit.get(`${table}.${column}`)?.decision?.selected?.recipeId ?? null;
  const unitOf = (table: string, column: string): string[] => { const u = idx.fieldUnit.get(`${table}.${column}`)?.unit.id; return u ? [u] : []; };
  const steps = 11;
  let step = 0;
  const tick = (msg: string) => onProgress?.(step++, steps, msg);

  tick("direct identifiers");
  metrics.push(...directIdentifierRetained(original, executed.tables, detections.fields, goal, unitOf));
  tick("text leakage");
  metrics.push(...textLeakage(input, outTable, idx));
  tick("independent text leakage");
  metrics.push(...independentLeakage(input, outTable, origTable));
  tick("k-anonymity");
  metrics.push(...kAnonymity(executed.tables, det, unitOf));
  tick("join integrity");
  metrics.push(...joinIntegrity(input, outTable, origTable, recipeOf, unitOf));
  tick("token uniqueness");
  metrics.push(...tokenUniqueness(original, outTable, recipeOf, unitOf));
  tick("vocabulary");
  metrics.push(...vocabularyRetained(original, outTable, recipeOf, unitOf));
  tick("category fidelity");
  metrics.push(...categoryFidelity(original, outTable, recipeOf, unitOf));
  metrics.push(...numericFidelity(original, outTable, recipeOf, unitOf));
  tick("temporal resolution");
  metrics.push(...temporalResolution(input, outTable, det, unitOf));
  tick("goal requirements");
  metrics.push(...requiredFields(input, outTable, unsupported));
  metrics.push(...rowsRetained(original, outTable));
  unsupported.push(...unsupportedAsks(goal));
  onProgress?.(steps, steps, "done");

  const hardFailures = metrics.filter((m) => m.threshold?.hard && m.status === "evaluated" && m.passed === false).map((m) => `${m.id}:${m.scope}`);
  return {
    version: 1, evaluationId: newId("eval"), inputHash: input.manifest.inputHash, goalId: goal.goalId, planHash: proposal.planHash,
    outputHash: executed.outputHash, metrics, hardFailures, unsupported: [...new Set(unsupported)], coverage: threatCoverage(input, metrics), createdAt: nowIso(),
    durationMs: Math.round(performance.now() - t0),
  };
}

const liveColumns = (t: ExecutedTable) => t.columns.map((c, i) => ({ c, i, d: t.data[i]! })).filter((x) => x.c.status !== "suppressed");
const outColumnFor = (t: ExecutedTable | undefined, source: string) => t ? t.columns.findIndex((c) => c.sourceColumn === source && c.status !== "suppressed" && c.status !== "derived") : -1;

// ---------------------------------------------------------------- risk

function directIdentifierRetained(original: TableData[], out: ExecutedTable[], fields: FieldDetection[], goal: GoalSpec, unitOf: (t: string, c: string) => string[]): MetricResult[] {
  const res: MetricResult[] = [];
  const hard = goal.recipient.trustLevel !== "internal";
  for (const t of original) {
    const ot = out.find((x) => x.name === t.name);
    const dcols = fields.filter((f) => f.ref.table === t.name && f.role === "direct_identifier");
    if (!ot || !dcols.length) continue;
    const live = liveColumns(ot);
    const exact = new Set<string>();
    for (const x of live) for (const v of x.d) if (v !== null) exact.add(v);
    const textCols = live.filter((x) => { let n = 0, sp = 0; for (let r = 0; r < Math.min(200, x.d.length); r++) { const v = x.d[r]; if (v) { n++; if (v.includes(" ") && v.length > 20) sp++; } } return n > 0 && sp / n > 0.2; });
    for (const f of dcols) {
      const ci = t.columns.indexOf(f.ref.column);
      const col = ci >= 0 ? t.data[ci]! : [];
      let n = 0, hit = 0;
      for (const r of sampleRows(col.length)) {
        const v = col[r];
        if (v === null || v === undefined || v.trim().length < 4) continue;
        n++;
        if (exact.has(v) || textCols.some((x) => (x.d[r] ?? "").includes(v))) hit++;
      }
      res.push(finish({
        id: "direct_identifier_retained", name: "Direct identifiers retained", kind: "risk", scope: `${t.name}.${f.ref.column}`,
        definition: "Share of sampled original values (non-empty, length ≥ 4, up to 20,000) of this direct-identifier column that appear verbatim as a whole cell in any output column of the same table, or inside a text cell of the same row.",
        value: n ? round(hit / n) : null, unit: "ratio", direction: "lower_better",
        threshold: hard ? { op: "<=", value: 0, hard: true } : undefined,
        detail: n ? `${hit} of ${n} sampled values found in the output (${f.subtype}).` : "No values of length ≥ 4 to check.",
        breakdown: { sampled: n, retained: hit }, basis: "own_detections", unitIds: unitOf(t.name, f.ref.column),
      }));
    }
  }
  return res;
}

function textLeakage(input: EvaluationInput, outTable: Map<string, ExecutedTable>, idx: ReturnType<typeof planIndex>): MetricResult[] {
  const res: MetricResult[] = [];
  for (const t of input.original) {
    const ot = outTable.get(t.name);
    t.columns.forEach((column, ci) => {
      const ud = idx.fieldUnit.get(`${t.name}.${column}`);
      if (ud?.decision?.selected?.recipeId !== "redact_text") return;
      const oi = outColumnFor(ot, column);
      if (!ot || oi < 0) return;
      const orig = t.data[ci]!, prot = ot.data[oi]!;
      const spanDec = idx.spanUnits.get(ud.unit.id);
      const total = new Map<string, number>(), leaked = new Map<string, number>(), kept = new Map<string, number>();
      let hardN = 0, hardLeak = 0, n = 0, leak = 0;
      for (let r = 0; r < orig.length; r++) {
        const text = orig[r];
        if (!text) continue;
        const spans = nonOverlapping(input.spans.get(t.name, column, r));
        if (!spans.length) continue;
        const p = (prot[r] ?? "").toLowerCase();
        for (const s of spans) {
          const v = text.slice(s.start, s.end).trim();
          if (v.length < 4) continue;
          const isLeak = p.includes(v.toLowerCase());
          const intentionalKeep = spanDec?.get(s.label)?.decision?.selected?.recipeId === "keep";
          if (HARD.has(s.label)) { hardN++; if (isLeak) hardLeak++; }
          if (intentionalKeep) { kept.set(s.label, (kept.get(s.label) ?? 0) + 1); continue; }
          n++; total.set(s.label, (total.get(s.label) ?? 0) + 1);
          if (isLeak) { leak++; leaked.set(s.label, (leaked.get(s.label) ?? 0) + 1); }
        }
      }
      const breakdown: Record<string, number> = {};
      for (const [l, c] of total) breakdown[l] = round((leaked.get(l) ?? 0) / c);
      for (const [l, c] of kept) breakdown[`kept:${l}`] = c;
      const unitIds = [ud.unit.id, ...[...(spanDec?.values() ?? [])].map((x) => x.unit.id)];
      res.push(finish({
        id: "text_leakage", name: "Detected spans surviving in text", kind: "risk", scope: `${t.name}.${column}`,
        definition: "Share of span values detected by Mask (length ≥ 4) whose text still appears, case-insensitively, in the protected text of the same cell. Spans whose label was deliberately kept are excluded and counted separately. Consistency check: execution used the same detections, so this does not measure what the detector missed.",
        value: n ? round(leak / n) : null, unit: "ratio", direction: "lower_better",
        detail: n ? `${leak} of ${n} transformed spans still visible; ${[...kept.values()].reduce((a, b) => a + b, 0)} spans kept by decision.` : "No detected spans of length ≥ 4.",
        breakdown, basis: "own_detections", unitIds,
      }));
      res.push(finish({
        id: "text_leakage_hard_labels", name: "Identifier and secret spans surviving in text", kind: "risk", scope: `${t.name}.${column}`,
        definition: `Share of detected spans with labels that may never survive verbatim (${HARD_SPAN_LABELS.join(", ")}) whose value still appears in the protected text of the same cell, whatever decision was made.`,
        value: hardN ? round(hardLeak / hardN) : null, unit: "ratio", direction: "lower_better",
        threshold: { op: "<=", value: 0, hard: true },
        detail: hardN ? `${hardLeak} of ${hardN} identifier/secret spans still visible.` : "No identifier or secret spans detected.",
        breakdown: { spans: hardN, leaked: hardLeak }, basis: "own_detections", unitIds,
      }));
    });
  }
  return res;
}

function independentLeakage(input: EvaluationInput, outTable: Map<string, ExecutedTable>, origTable: Map<string, TableData>): MetricResult[] {
  const res: MetricResult[] = [];
  for (const dl of input.devLabels ?? []) {
    const t = origTable.get(dl.table), ot = outTable.get(dl.table);
    const scope = `${dl.table}.${dl.column}`;
    const base = {
      id: "text_leakage_independent", name: "Gold spans surviving in text (development labels)", kind: "risk" as const, scope,
      definition: "Share of independently labelled PII spans (length ≥ 4) whose value still appears, case-insensitively, in the protected text of the same record. Development measurement on labelled fixtures, not a benchmark.",
      unit: "ratio" as const, direction: "lower_better" as const, basis: "independent_labels" as const,
    };
    const ci = t ? t.columns.indexOf(dl.column) : -1;
    const ii = t ? t.columns.indexOf(dl.idColumn) : -1;
    if (!t || !ot || ci < 0 || ii < 0) { res.push(finish({ ...base, value: null, status: "failed", detail: "Labelled table, text column or record id column not found." })); continue; }
    const oi = outColumnFor(ot, dl.column);
    const rowOf = new Map<string, number>();
    t.data[ii]!.forEach((v, r) => { if (v !== null) rowOf.set(v, r); });
    const total = new Map<string, number>(), leaked = new Map<string, number>();
    let n = 0, leak = 0, missing = 0;
    for (const [rid, spans] of Object.entries(dl.spans)) {
      const r = rowOf.get(rid);
      if (r === undefined) { missing++; continue; }
      const text = t.data[ci]![r] ?? "";
      const p = oi >= 0 ? (ot.data[oi]![r] ?? "").toLowerCase() : "";
      for (const s of spans) {
        const v = text.slice(s.start, s.end).trim();
        if (v.length < 4) continue;
        n++; total.set(s.label, (total.get(s.label) ?? 0) + 1);
        if (p.includes(v.toLowerCase())) { leak++; leaked.set(s.label, (leaked.get(s.label) ?? 0) + 1); }
      }
    }
    const breakdown: Record<string, number> = {};
    for (const [l, c] of total) breakdown[l] = round((leaked.get(l) ?? 0) / c);
    res.push(finish({ ...base, value: n ? round(leak / n) : null, detail: `${leak} of ${n} gold spans still visible${oi < 0 ? " (column removed)" : ""}${missing ? `; ${missing} labelled records not found` : ""}.`, breakdown }));
  }
  return res;
}

function kAnonymity(out: ExecutedTable[], det: Map<string, FieldDetection>, unitOf: (t: string, c: string) => string[]): MetricResult[] {
  const res: MetricResult[] = [];
  for (const t of out) {
    const qi = t.columns.map((c, i) => ({ c, i })).filter(({ c }) => {
      if (c.status === "suppressed") return false;
      if (c.status === "derived") return /_(age_band|sex)$/.test(c.name);
      return !!c.sourceColumn && det.get(`${t.name}.${c.sourceColumn}`)?.role === "quasi_identifier";
    });
    const base = {
      id: "k_anonymity", name: "Rows in small groups (k < 5)", kind: "risk" as const, scope: t.name,
      definition: "Share of rows whose combination of released quasi-identifier values (kept or generalised quasi-identifier columns plus derived age band and sex) is shared by fewer than 5 rows of the table.",
      unit: "ratio" as const, direction: "lower_better" as const, threshold: { op: "<=" as const, value: 0.05, hard: false }, basis: "own_detections" as const,
    };
    if (!qi.length || !t.rowCount) { res.push(finish({ ...base, value: null, detail: "No quasi-identifier columns released in this table." })); continue; }
    const counts = new Map<string, number>();
    const keys = new Array<string>(t.rowCount);
    for (let r = 0; r < t.rowCount; r++) {
      let k = "";
      for (const { i } of qi) k += (t.data[i]![r] ?? "∅") + "\u0001";
      keys[r] = k;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let atRisk = 0, minSize = Infinity;
    for (const n of counts.values()) { if (n < K) atRisk += n; if (n < minSize) minSize = n; }
    res.push(finish({
      ...base, value: round(atRisk / t.rowCount),
      detail: `Quasi-identifiers: ${qi.map((x) => x.c.name).join(", ")}. ${counts.size} groups; ${atRisk} of ${t.rowCount} rows in groups smaller than ${K}.`,
      breakdown: { classes: counts.size, minClassSize: minSize, rowsAtRisk: atRisk, columns: qi.length },
      unitIds: [...new Set(qi.flatMap((x) => (x.c.sourceColumn ? unitOf(t.name, x.c.sourceColumn) : [])))],
    }));
  }
  return res;
}

function joinIntegrity(input: EvaluationInput, outTable: Map<string, ExecutedTable>, origTable: Map<string, TableData>, recipeOf: (t: string, c: string) => RecipeId | null, unitOf: (t: string, c: string) => string[]): MetricResult[] {
  const res: MetricResult[] = [];
  const hard = input.goal.linkage !== "none";
  for (const rel of input.manifest.relationships) {
    const scope = `${rel.from.table}.${rel.from.column}`;
    const rf = recipeOf(rel.from.table, rel.from.column), rt = recipeOf(rel.to.table, rel.to.column);
    const base = {
      id: "join_integrity", name: `Join ${rel.from.table}.${rel.from.column} → ${rel.to.table}.${rel.to.column}`, kind: "integrity" as const, scope,
      definition: "Share of non-empty output values of the referencing column found among the output values of the referenced column, divided by the same share in the original data (1 = every join that worked before still works).",
      unit: "ratio" as const, direction: "higher_better" as const, basis: "structural" as const, unitIds: [...new Set([...unitOf(rel.from.table, rel.from.column), ...unitOf(rel.to.table, rel.to.column)])],
    };
    const of = outTable.get(rel.from.table), ot = outTable.get(rel.to.table);
    const fi = outColumnFor(of, rel.from.column), ti = outColumnFor(ot, rel.to.column);
    if (!of || !ot || fi < 0 || ti < 0) { res.push(finish({ ...base, value: null, detail: `Not applicable: ${fi < 0 ? rel.from.column : rel.to.column} is not released.` })); continue; }
    const rate = (from: (string | null)[], to: (string | null)[]) => {
      const set = new Set<string>(); for (const v of to) if (v !== null) set.add(v);
      let n = 0, hit = 0; for (const v of from) if (v !== null) { n++; if (set.has(v)) hit++; }
      return n ? hit / n : null;
    };
    const oft = origTable.get(rel.from.table), ott = origTable.get(rel.to.table);
    const origRate = oft && ott ? rate(oft.data[oft.columns.indexOf(rel.from.column)] ?? [], ott.data[ott.columns.indexOf(rel.to.column)] ?? []) : rel.matchRate;
    const outRate = rate(of.data[fi]!, ot.data[ti]!);
    if (outRate === null || origRate === null || origRate === 0) { res.push(finish({ ...base, value: null, detail: "No joinable values in the original." })); continue; }
    const tokenised = rf === "tokenize_keyed" && rt === "tokenize_keyed";
    res.push(finish({
      ...base, value: round(Math.min(1, outRate / origRate)),
      threshold: { op: ">=", value: 0.999, hard },
      detail: `Output match rate ${round(outRate, 4)} vs original ${round(origRate, 4)} (${rf ?? "none"} / ${rt ?? "none"}${tokenised ? ", both tokenised" : ""}).`,
      breakdown: { outputMatchRate: round(outRate), originalMatchRate: round(origRate) },
    }));
  }
  return res;
}

function tokenUniqueness(original: TableData[], outTable: Map<string, ExecutedTable>, recipeOf: (t: string, c: string) => RecipeId | null, unitOf: (t: string, c: string) => string[]): MetricResult[] {
  const res: MetricResult[] = [];
  for (const t of original) t.columns.forEach((column, ci) => {
    if (recipeOf(t.name, column) !== "tokenize_keyed") return;
    const ot = outTable.get(t.name); const oi = outColumnFor(ot, column);
    if (!ot || oi < 0) return;
    const a = new Set<string>(), b = new Set<string>();
    for (const v of t.data[ci]!) if (v !== null) a.add(v);
    for (const v of ot.data[oi]!) if (v !== null) b.add(v);
    res.push(finish({
      id: "token_uniqueness", name: "Distinct tokens per distinct value", kind: "integrity", scope: `${t.name}.${column}`,
      definition: "Distinct output tokens divided by distinct original values. 1 means no two different values received the same token.",
      value: a.size ? round(b.size / a.size) : null, unit: "ratio", direction: "higher_better", threshold: { op: ">=", value: 1, hard: false },
      detail: `${b.size} distinct tokens for ${a.size} distinct values.`, breakdown: { distinctOriginal: a.size, distinctTokens: b.size }, basis: "structural", unitIds: unitOf(t.name, column),
    }));
  });
  return res;
}

// ---------------------------------------------------------------- utility

function wordCounts(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of text.toLowerCase().match(WORD) ?? []) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
}

function vocabularyRetained(original: TableData[], outTable: Map<string, ExecutedTable>, recipeOf: (t: string, c: string) => RecipeId | null, unitOf: (t: string, c: string) => string[]): MetricResult[] {
  const res: MetricResult[] = [];
  for (const t of original) t.columns.forEach((column, ci) => {
    if (recipeOf(t.name, column) !== "redact_text") return;
    const ot = outTable.get(t.name); const oi = outColumnFor(ot, column);
    if (!ot || oi < 0) return;
    const rows = sampleRows(t.rowCount).filter((r) => !!t.data[ci]![r]);
    const docs = rows.map((r) => wordCounts(t.data[ci]![r]!));
    const df = new Map<string, number>();
    for (const d of docs) for (const w of d.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    const minDf = Math.max(5, Math.ceil(0.01 * rows.length));
    const common = new Set([...df].filter(([, c]) => c >= minDf).map(([w]) => w));
    let kept = 0, total = 0;
    rows.forEach((r, i) => {
      const o = docs[i]!;
      let has = false;
      for (const w of o.keys()) if (common.has(w)) { has = true; break; }
      if (!has) return;
      const p = wordCounts(ot.data[oi]![r] ?? "");
      for (const [w, c] of o) if (common.has(w)) { total += c; kept += Math.min(c, p.get(w) ?? 0); }
    });
    res.push(finish({
      id: "vocabulary_retained", name: "Ordinary vocabulary retained", kind: "utility", scope: `${t.name}.${column}`,
      definition: `Share of common word tokens (letters only, ≥ 3 characters, used in at least ${minDf} of ${rows.length} sampled rows) that remain in the protected text of the same row.`,
      value: total ? round(kept / total) : null, unit: "ratio", direction: "higher_better",
      detail: `${common.size} common words; ${kept} of ${total} occurrences retained.`, breakdown: { commonWords: common.size, rowsSampled: rows.length }, basis: "structural", unitIds: unitOf(t.name, column),
    }));
  });
  return res;
}

function categoryFidelity(original: TableData[], outTable: Map<string, ExecutedTable>, recipeOf: (t: string, c: string) => RecipeId | null, unitOf: (t: string, c: string) => string[]): MetricResult[] {
  const res: MetricResult[] = [];
  for (const t of original) t.columns.forEach((column, ci) => {
    if (recipeOf(t.name, column) !== "generalize_category_rare") return;
    const ot = outTable.get(t.name); const oi = outColumnFor(ot, column);
    if (!ot || oi < 0) return;
    const dist = (col: (string | null)[]) => { const m = new Map<string, number>(); for (const v of col) { const k = v ?? "∅"; m.set(k, (m.get(k) ?? 0) + 1); } return m; };
    const a = dist(t.data[ci]!), b = dist(ot.data[oi]!);
    const n = t.rowCount || 1;
    let tvd = 0;
    for (const k of new Set([...a.keys(), ...b.keys()])) tvd += Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0)) / n;
    tvd /= 2;
    res.push(finish({
      id: "category_fidelity", name: "Category distribution preserved", kind: "utility", scope: `${t.name}.${column}`,
      definition: "1 − 2 × total variation distance between the original and output category distributions (rare categories merged into 'other' count as moved mass); clipped to [0, 1].",
      value: round(Math.max(0, Math.min(1, 1 - 2 * tvd))), unit: "ratio", direction: "higher_better",
      detail: `TVD ${round(tvd, 4)}; ${a.size} original categories, ${b.size} output categories.`, breakdown: { tvd: round(tvd), originalCategories: a.size, outputCategories: b.size }, basis: "structural", unitIds: unitOf(t.name, column),
    }));
  });
  return res;
}

/** Midpoint of a bin label such as "10-19" or "90+" (top-coded = threshold). */
export function binMidpoint(label: string): number | null {
  const top = /^(-?\d+(?:\.\d+)?)\+$/.exec(label);
  if (top) return Number(top[1]);
  const m = /^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/.exec(label);
  return m ? (Number(m[1]) + Number(m[2])) / 2 : null;
}

function numericFidelity(original: TableData[], outTable: Map<string, ExecutedTable>, recipeOf: (t: string, c: string) => RecipeId | null, unitOf: (t: string, c: string) => string[]): MetricResult[] {
  const res: MetricResult[] = [];
  for (const t of original) t.columns.forEach((column, ci) => {
    if (recipeOf(t.name, column) !== "generalize_numeric_bin") return;
    const ot = outTable.get(t.name); const oi = outColumnFor(ot, column);
    if (!ot || oi < 0) return;
    let so = 0, no = 0, sp = 0, np = 0;
    for (const v of t.data[ci]!) { if (v === null) continue; const x = parseNumber(v); if (x !== null) { so += x; no++; } }
    for (const v of ot.data[oi]!) { if (v === null) continue; const x = binMidpoint(v); if (x !== null) { sp += x; np++; } }
    const mo = no ? so / no : null, mp = np ? sp / np : null;
    const value = mo === null || mp === null ? null : mo === 0 ? (mp === 0 ? 1 : 0) : Math.max(0, 1 - Math.abs(mp - mo) / Math.abs(mo));
    res.push(finish({
      id: "numeric_fidelity", name: "Mean preserved after binning", kind: "utility", scope: `${t.name}.${column}`,
      definition: "1 − relative error of the column mean when each bin is replaced by its midpoint (top-coded values by the threshold); clipped at 0.",
      value: value === null ? null : round(value), unit: "ratio", direction: "higher_better",
      detail: mo === null || mp === null ? "No numeric values." : `Original mean ${round(mo, 3)}, mean from bins ${round(mp, 3)}.`, basis: "structural", unitIds: unitOf(t.name, column),
    }));
  });
  return res;
}

// ---------------------------------------------------------------- integrity and goal

function temporalResolution(input: EvaluationInput, outTable: Map<string, ExecutedTable>, det: Map<string, FieldDetection>, unitOf: (t: string, c: string) => string[]): MetricResult[] {
  const res: MetricResult[] = [];
  const idx = planIndex(input.proposal);
  const requested = input.goal.resolution.time;
  for (const t of input.original) for (const column of t.columns) {
    const d = det.get(`${t.name}.${column}`);
    const sel = idx.fieldUnit.get(`${t.name}.${column}`)?.decision?.selected;
    const isTime = sel?.recipeId === "generalize_datetime" || (d && (d.subtype === "TIMESTAMP" || d.subtype === "DATE"));
    if (!isTime || d?.subtype === "BIRTH_DATE") continue;
    const ot = outTable.get(t.name);
    if (outColumnFor(ot, column) < 0) continue;
    const outRes: TimeResolution = sel?.recipeId === "generalize_datetime" ? (String(sel.params.resolution) as TimeResolution) : "exact";
    const ok = !requested || TIME_ORDER.indexOf(outRes) <= TIME_ORDER.indexOf(requested);
    res.push(finish({
      id: "temporal_resolution", name: "Time resolution vs goal", kind: "integrity", scope: `${t.name}.${column}`,
      definition: "Whether the released time resolution is at least as fine as the resolution the goal asked for (1 = yes, 0 = coarser than requested). Informative.",
      value: ok ? 1 : 0, unit: "score", direction: "higher_better", passed: ok,
      detail: `Output resolution ${outRes}; goal asked for ${requested ?? "no specific resolution"}.`, basis: "goal_requirement", unitIds: unitOf(t.name, column),
    }));
  }
  return res;
}

/** Resolve "table.column" or a bare column name (case-insensitive) to original columns. */
function resolveColumn(original: TableData[], name: string): { table: string; column: string }[] {
  const n = name.trim().toLowerCase();
  const out: { table: string; column: string }[] = [];
  for (const t of original) for (const c of t.columns) {
    if (`${t.name}.${c}`.toLowerCase() === n || c.toLowerCase() === n) out.push({ table: t.name, column: c });
  }
  return out;
}

function requiredFields(input: EvaluationInput, outTable: Map<string, ExecutedTable>, unsupported: string[]): MetricResult[] {
  const asked = [...input.goal.requiredFields.map((f) => ({ f, required: true })), ...input.goal.groupings.map((f) => ({ f, required: false }))];
  const present: string[] = [], missing: string[] = [];
  const unitIds: string[] = [];
  const idx = planIndex(input.proposal);
  for (const { f, required } of asked) {
    const refs = resolveColumn(input.original, f);
    if (!refs.length) {
      if (required || /^[\w.]+$/.test(f.trim())) unsupported.push(`Goal names "${f}", which is not a column in the data; it cannot be checked.`);
      continue;
    }
    for (const r of refs) {
      const key = `${r.table}.${r.column}`;
      const ot = outTable.get(r.table);
      const released = !!ot?.columns.some((c) => c.sourceColumn === r.column && c.status !== "suppressed");
      (released ? present : missing).push(key);
      const u = idx.fieldUnit.get(key)?.unit.id; if (u) unitIds.push(u);
    }
  }
  const uniq = (xs: string[]) => [...new Set(xs)];
  const p = uniq(present), m = uniq(missing);
  const n = p.length + m.length;
  return [finish({
    id: "utility_field_required", name: "Fields the goal needs are released", kind: "utility", scope: "dataset",
    definition: "Share of columns named in the goal's required fields and groupings that are present in the output (kept, transformed or derived). Any removed column fails.",
    value: n ? round(p.length / n) : null, unit: "ratio", direction: "higher_better", threshold: n ? { op: ">=", value: 1, hard: true } : undefined,
    detail: n ? `Released: ${p.join(", ") || "none"}. Removed: ${m.join(", ") || "none"}.` : "The goal names no columns of this dataset.",
    breakdown: { named: n, released: p.length, removed: m.length }, basis: "goal_requirement", unitIds: uniq(unitIds),
  })];
}

function rowsRetained(original: TableData[], outTable: Map<string, ExecutedTable>): MetricResult[] {
  return original.map((t) => {
    const ot = outTable.get(t.name);
    const withheld = !ot || ot.columns.every((c) => c.status === "suppressed");
    return finish({
      id: "rows_retained", name: "Rows retained", kind: "integrity", scope: t.name,
      definition: "Output rows divided by input rows for this table (row order and identity are preserved).",
      value: t.rowCount ? (withheld ? 0 : round((ot?.rowCount ?? 0) / t.rowCount)) : null, unit: "ratio", direction: "higher_better",
      threshold: { op: ">=", value: 1, hard: false },
      detail: withheld ? "Table withheld: every column removed." : `${ot?.rowCount ?? 0} of ${t.rowCount} rows.`, basis: "structural",
    });
  });
}

const UNSUPPORTED_PATTERNS: [RegExp, string][] = [
  [/membership inference/i, "Membership-inference risk is not measured by Mask (it applies to synthetic data, which Mask does not produce)."],
  [/differential(ly)? privacy|\bdp\b|epsilon|ε-?dp/i, "Differential privacy guarantees are not provided or measured: Mask does not add calibrated noise."],
  [/synthetic/i, "Synthetic-data fidelity and distance-to-closest-record are not measured: Mask transforms the real records."],
  [/linkage attack|re-?identification attack|attribute inference/i, "Attack-based re-identification and attribute-inference rates are not simulated; only k-anonymity over detected quasi-identifiers is measured."],
  [/trajector|unicity/i, "Trajectory unicity is not measured."],
  [/hash(ed)? .*reversib|rainbow|dictionary attack/i, "Reversibility of hashed identifiers is not tested; Mask uses keyed tokens."],
  [/model (accuracy|f1|performance)|classifier (accuracy|f1)/i, "Downstream model accuracy is not measured; vocabulary retention is a proxy."],
];

function unsupportedAsks(goal: GoalSpec): string[] {
  const texts = [...goal.measures, ...goal.threatAssumptions, goal.rawText, goal.task.description];
  const out: string[] = [];
  for (const [re, msg] of UNSUPPORTED_PATTERNS) if (texts.some((s) => re.test(s))) out.push(msg);
  return out;
}

// ---------------------------------------------------------------- threat coverage

/** Status of a threat from the metrics that evaluate it: any failed -> failed; any evaluated -> evaluated; else not_applicable. */
function statusFrom(ms: MetricResult[]): ThreatCoverage["status"] {
  if (ms.some((m) => m.status === "failed")) return "failed";
  if (ms.some((m) => m.status === "evaluated")) return "evaluated";
  return "not_applicable";
}
const ref = (m: MetricResult): string => `${m.id}:${m.scope}`;

/**
 * Threats implied by the sharing setting and what (if anything) in this evaluation covers them.
 * Threats Mask has no test for are listed as unsupported, never as zero risk.
 */
export function threatCoverage(input: EvaluationInput, metrics: MetricResult[]): ThreatCoverage[] {
  const of = (...ids: string[]) => metrics.filter((m) => ids.includes(m.id));
  const out: ThreatCoverage[] = [];
  const direct = of("direct_identifier_retained");
  out.push({ threatId: "direct_reidentification", description: "Direct re-identification from retained identifiers.", attackerKnowledge: "none beyond the released files",
    status: statusFrom(direct), evaluatedBy: direct.map(ref), statusReason: direct.length ? "measured on columns Mask detected as direct identifiers" : "no direct-identifier columns detected" });
  const k = of("k_anonymity");
  const kEval = k.filter((m) => m.status === "evaluated");
  out.push({ threatId: "quasi_identifier_linkage", description: "Linkage on quasi-identifiers: a rare combination of released attributes singles a person out.", attackerKnowledge: "knows some of the person's quasi-identifier values",
    status: statusFrom(k), evaluatedBy: kEval.map(ref), statusReason: kEval.length ? "k-anonymity (k = 5) per table over quasi-identifiers Mask detected" : "no quasi-identifier columns released" });
  const text = of("text_leakage", "text_leakage_hard_labels", "text_leakage_independent");
  const independent = text.some((m) => m.id === "text_leakage_independent" && m.status === "evaluated");
  out.push({ threatId: "free_text_identifier_leakage", description: "Identifier leakage in free text.", attackerKnowledge: "none beyond the released files",
    status: statusFrom(text), evaluatedBy: text.map(ref),
    statusReason: !text.length ? "no redacted text columns released" : independent ? "measured against Mask's own detections and independent development labels" : "measured against Mask's own detections only: identifiers the detector missed are not covered" });
  const keys = of("join_integrity", "token_uniqueness").filter((m) => m.status !== "not_applicable");
  out.push({ threatId: "cross_table_key_linkage", description: "Cross-table linkage via keys: released keys or tokens connect a person's records across tables.", attackerKnowledge: "the released tables and their join keys",
    status: statusFrom(keys), evaluatedBy: keys.map(ref),
    statusReason: keys.length ? "join and token checks confirm which keys still link records; the added re-identification risk of combining linked tables is not measured" : "no keys or tokens link released tables" });
  out.push({ threatId: "membership_inference", description: "Membership inference: deciding whether a person's record is in the release.", attackerKnowledge: "a target's full record and holdout data",
    status: "unsupported", evaluatedBy: [], statusReason: "no holdout data in-app" });
  out.push({ threatId: "attribute_inference_external", description: "Attribute inference on sensitive attributes via linkage with external lists.", attackerKnowledge: "external lists with identities and overlapping attributes",
    status: "unsupported", evaluatedBy: [], statusReason: "requires attacker knowledge files; available only in the private benchmark adapter" });
  const ind = of("text_leakage_independent").filter((m) => m.status !== "not_applicable");
  out.push({ threatId: "undetected_spoken_identifiers", description: "Spoken or split identifiers (e.g. digits read out word by word) not detected and left in text.", attackerKnowledge: "none beyond the released files",
    status: ind.length ? statusFrom(ind) : "unsupported", evaluatedBy: ind.map(ref),
    statusReason: ind.length ? "development measurement against independent labels; not a guarantee on other data" : "detection recall cannot be measured without labels" });
  const tokens = of("token_uniqueness");
  if (tokens.length) out.push({ threatId: "token_reversal", description: "Pseudonymous tokens are reversed by hashing candidate values.", attackerKnowledge: "candidate identifier values, no session key",
    status: "unsupported", evaluatedBy: [], statusReason: "not tested; tokens are keyed HMAC-SHA-256 with a session key that is never exported, so unkeyed candidate hashing cannot reproduce them by construction" });
  return out;
}
