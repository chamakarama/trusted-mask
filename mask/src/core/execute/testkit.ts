/** Test helpers (used only by *.test.ts in execute/evaluate/export). Builds small tables, manifests, detections and plans. */
import type {
  ColumnManifest, DatasetManifest, Decision, DecisionUnit, FieldDetection, GoalSpec, PrivacyRole, Proposal, RecipeId, RecipeParams,
  Relationship, SpanDetection, Subtype, TokenScope,
} from "@/contracts";
import { columnKey } from "@/contracts";
import type { TableData } from "@/core/session/types";
import { hashOf } from "@/core/util/hash";
import type { SpanIndex } from "./types";

export function mkTable(name: string, columns: string[], rows: (string | null)[][], fileName = `${name}.csv`): TableData {
  const data = columns.map((_, c) => rows.map((r) => (r[c] === undefined || r[c] === "" ? null : r[c]!)));
  return { name, fileName, columns, data, rowCount: rows.length, byteSize: 0, sha256: hashOf({ name, rows }), parseWarnings: [] };
}

export function columnStats(col: (string | null)[]): ColumnManifest["stats"] {
  const vals = col.filter((v): v is string => v !== null);
  const distinct = new Set(vals).size;
  const numeric = vals.filter((v) => v.trim() !== "" && Number.isFinite(Number(v))).length;
  return {
    count: col.length, nonEmpty: vals.length, distinct, uniqueRatio: vals.length ? distinct / vals.length : 0,
    meanLength: vals.length ? vals.reduce((a, v) => a + v.length, 0) / vals.length : 0, maxLength: vals.reduce((a, v) => Math.max(a, v.length), 0),
    spaceShare: vals.length ? vals.filter((v) => /\s/.test(v)).length / vals.length : 0, numericShare: vals.length ? numeric / vals.length : 0,
  };
}

export function mkManifest(tables: TableData[], relationships: Omit<Relationship, "id" | "evidence" | "kind">[] = [], inferred: Record<string, ColumnManifest["inferredType"]> = {}): DatasetManifest {
  return {
    version: 1, inputHash: hashOf(tables.map((t) => t.sha256)), createdAt: "2025-01-01T00:00:00.000Z",
    tables: tables.map((t) => ({
      name: t.name, fileName: t.fileName, rowCount: t.rowCount, byteSize: 0, sha256: t.sha256, parseWarnings: [],
      columns: t.columns.map((c, i) => ({ name: c, index: i, inferredType: inferred[`${t.name}.${c}`] ?? "string", stats: columnStats(t.data[i]!) })),
    })),
    relationships: relationships.map((r, i) => ({ id: `rel${i}`, kind: "foreign_key", evidence: "test", ...r })),
  };
}

export function mkDetection(table: string, column: string, role: PrivacyRole, subtype: Subtype, extra: Partial<FieldDetection> = {}): FieldDetection {
  return {
    id: `det:${table}.${column}`, kind: "field", ref: { table, column }, role, subtype, art9: false, confidence: "high", score: 0.9,
    evidence: [], needsReview: false, reviewReasons: [], relationships: [], alternatives: [], detector: { id: "test", version: "0" }, ...extra,
  };
}

export interface PlanEntry { unit: DecisionUnit; recipe: RecipeId | null; params?: RecipeParams }

export const fieldUnit = (table: string, column: string): DecisionUnit => ({ id: `f:${table}.${column}`, kind: "field", refs: [{ table, column }], detectionIds: [`det:${table}.${column}`] });
export const groupUnit = (...refs: [string, string][]): DecisionUnit => {
  const rs = refs.map(([table, column]) => ({ table, column }));
  return { id: `g:${rs.map(columnKey).join("+")}`, kind: "field_group", refs: rs, detectionIds: rs.map((r) => `det:${columnKey(r)}`) };
};
export const spanUnit = (table: string, column: string, label: SpanDetection["label"]): DecisionUnit =>
  ({ id: `s:${table}.${column}:${label}`, kind: "span_class", refs: [{ table, column }], spanLabel: label, detectionIds: [`det:${table}.${column}`], parentUnitId: `f:${table}.${column}` });

export function mkProposal(entries: PlanEntry[], inputHash = "in", goalId = "goal"): Proposal {
  const decisions: Decision[] = entries.map((e) => ({
    unitId: e.unit.id, candidates: [], selected: e.recipe ? { recipeId: e.recipe, params: e.params ?? {} } : null, abstained: !e.recipe,
    reason: `test decision ${e.recipe ?? "none"}`, detail: [], source: "selector", reviewState: "proposed", needsReview: false, reviewReasons: [],
  }));
  const scopes: TokenScope[] = [];
  const dataset: TokenScope = { id: "dataset", columns: [], keyId: "k" };
  for (const e of entries) if (e.recipe === "tokenize_keyed") {
    if (e.params?.scope === "table") for (const r of e.unit.refs) scopes.push({ id: `table:${r.table}`, columns: [r], keyId: "k" });
    else dataset.columns.push(...e.unit.refs);
  }
  if (dataset.columns.length) scopes.unshift(dataset);
  return {
    version: 1, proposalId: "p1", inputHash, goalId, selector: { id: "policy", version: "test", registryVersion: "1.0.0" },
    units: entries.map((e) => e.unit), decisions, tokenScopes: scopes,
    planHash: hashOf(entries.map((e) => [e.unit.id, e.recipe, e.params ?? {}])), createdAt: "2025-01-01T00:00:00.000Z", warnings: [],
  };
}

export function mkGoal(over: Partial<GoalSpec> = {}): GoalSpec {
  return {
    version: 1, goalId: "goal", rawText: "test goal", task: { kind: "topic_mining", description: "find contact reasons" },
    recipient: { description: "analytics vendor", trustLevel: "contractual" }, outputForm: "row_level", measures: [], groupings: [],
    resolution: {}, requiredFields: [], linkage: "across_tables", textNeed: "topic_only", exclusions: [], threatAssumptions: [], unresolved: [],
    provenance: { interpreter: "test", version: "0", notes: [] }, ...over,
  };
}

/** SpanIndex backed by a map keyed `${table}.${column}:${row}`. */
export function stubSpans(map: Record<string, SpanDetection[]>): SpanIndex {
  return { get: (table, column, row) => map[`${table}.${column}:${row}`] ?? [] };
}

export const sp = (start: number, end: number, label: SpanDetection["label"]): SpanDetection => ({ start, end, label, score: 1, ruleId: "test" });

/** Span for the first occurrence of `needle` in `text`. */
export function spanOf(text: string, needle: string, label: SpanDetection["label"], from = 0): SpanDetection {
  const i = text.indexOf(needle, from);
  if (i < 0) throw new Error(`"${needle}" not in text`);
  return sp(i, i + needle.length, label);
}

export const KEY = new Uint8Array(32).map((_, i) => i + 1);
