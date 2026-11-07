/**
 * Drives the Mask engine from Node exactly as the pipeline worker does: profile -> detect -> units/candidates ->
 * proposal (policy / learned / overrides, plus the leaky and destructive control variants) -> execute.
 */
import fs from "node:fs";
import type { DatasetManifest, DecisionOverride, FieldDetection, GoalSpec, ModelArtifact, Proposal, SpanDetection } from "@/contracts";
import { columnKey, ModelArtifactSchema } from "@/contracts";
import { createFieldDetector, createProfiler, createSpanDetector } from "@/core/detect";
import type { SpanIndex } from "@/core/execute";
import { createExecutor } from "@/core/execute";
import { createGoalEmbedder } from "@/core/goal";
import { candidateKey, registry } from "@/core/registry";
import { buildDecisionUnits, enumerateCandidates, keyOf, PolicySelector, primaryDetection, detectionFor, type SelectionContext } from "@/core/selector";
import { createLearnedSelector } from "@/core/selector/learned";
import type { TableData } from "@/core/session/types";
import { sha256Hex } from "@/core/util/hash";
import type { CatalogRow } from "../../labels/common";

export type DetectionMode = "catalog" | "mask";

export interface EngineContext {
  tables: TableData[];
  manifest: DatasetManifest;
  detections: FieldDetection[];
  detectionMode: DetectionMode;
  detector: { id: string; version: string };
  spans: SpanIndex;
  spanDetector: { id: string; version: string };
}

/** Span index over every text cell, computed lazily with the Mask span detector and cached (like the worker). */
export function makeSpanIndex(tables: TableData[]): { index: SpanIndex; detector: { id: string; version: string } } {
  const sd = createSpanDetector();
  const cache = new Map<string, SpanDetection[]>();
  const byName = new Map(tables.map((t) => [t.name, t]));
  return {
    detector: { id: sd.id, version: sd.version },
    index: {
      get(table, column, row) {
        const key = `${table}.${column}:${row}`;
        let s = cache.get(key);
        if (!s) {
          const t = byName.get(table);
          const ci = t ? t.columns.indexOf(column) : -1;
          const text = t && ci >= 0 ? t.data[ci]?.[row] : null;
          s = text ? sd.detect(text, { column }) : [];
          cache.set(key, s);
        }
        return s;
      },
    },
  };
}

/**
 * Catalog detections: content labels from metadata/field_catalog.csv (privileged: the organiser's labels), with the
 * Mask span detector's full scan of free-text columns for span classes. Transformation-only comparison mode.
 */
export function catalogDetections(tables: TableData[], manifest: DatasetManifest, catalog: CatalogRow[], spans: SpanIndex, spanDet: { id: string; version: string }): FieldDetection[] {
  const out: FieldDetection[] = [];
  for (const t of tables) for (const column of t.columns) {
    const r = catalog.find((x) => x.table === t.name && x.column === column);
    if (!r) continue;
    const ref = { table: t.name, column };
    const rels = manifest.relationships.filter((x) => columnKey(x.from) === columnKey(ref) || columnKey(x.to) === columnKey(ref)).map((x) => x.id);
    let spanSummary: FieldDetection["spanSummary"];
    if (r.privacy_role === "free_text") {
      const byLabel: Record<string, number> = {};
      let withSpans = 0;
      for (let row = 0; row < t.rowCount; row++) {
        const s = spans.get(t.name, column, row);
        if (s.length) withSpans++;
        for (const x of s) byLabel[x.label] = (byLabel[x.label] ?? 0) + 1;
      }
      spanSummary = { rowsScanned: t.rowCount, rowsWithSpans: withSpans, byLabel, detectorId: spanDet.id, detectorVersion: spanDet.version };
    }
    out.push({
      id: `d:${columnKey(ref)}`, kind: "field", ref, role: r.privacy_role, subtype: r.subtype, art9: r.art9, confidence: "high", score: 1,
      evidence: [{ ruleId: "catalog", description: `field_catalog.csv: ${r.privacy_role}/${r.subtype}` }],
      needsReview: false, reviewReasons: [], relationships: rels, alternatives: [],
      ...(spanSummary ? { spanSummary } : {}),
      detector: { id: "catalog", version: "TRUSTED_PETS_PROVING_GROUND_2026@1.0.0" },
    });
  }
  return out;
}

export function buildEngineContext(tables: TableData[], mode: DetectionMode, catalog: CatalogRow[]): EngineContext {
  const { manifest } = createProfiler().profile(tables);
  const { index, detector: spanDetector } = makeSpanIndex(tables);
  if (mode === "catalog") {
    const detections = catalogDetections(tables, manifest, catalog, index, spanDetector);
    return { tables, manifest, detections, detectionMode: mode, detector: { id: "catalog", version: "TRUSTED_PETS_PROVING_GROUND_2026@1.0.0" }, spans: index, spanDetector };
  }
  const fd = createFieldDetector();
  const set = fd.detectFields(tables, manifest, createSpanDetector());
  return { tables, manifest, detections: set.fields, detectionMode: mode, detector: { id: fd.id, version: fd.version }, spans: index, spanDetector };
}

export type PlanSpec =
  | { kind: "policy" }
  | { kind: "learned"; modelPath: string }
  | { kind: "overrides"; overrides: DecisionOverride[]; source: string };
export type Variant = "leaky" | "destructive";
export type Control = "retained_identifiers" | "utility_destroying";

export function selectionContext(ctx: EngineContext, goal: GoalSpec, overrides: DecisionOverride[] = []): SelectionContext {
  const units = buildDecisionUnits(ctx.manifest, ctx.detections);
  return { manifest: ctx.manifest, goal, detections: ctx.detections, units, registry, overrides };
}

const LEAKY_SPAN_LABELS = new Set(["PERSON", "PHONE", "EMAIL"]);
const KEY_ROLES = new Set(["record_key", "technical_identifier"]);

/** Positive control: keep every direct-identifier column and PERSON/PHONE/EMAIL spans (invalid choices, applied anyway). */
export function leakyOverrides(sctx: SelectionContext): DecisionOverride[] {
  const out: DecisionOverride[] = [];
  for (const u of sctx.units) {
    if (u.kind === "span_class") { if (u.spanLabel && LEAKY_SPAN_LABELS.has(u.spanLabel)) out.push({ unitId: u.id, recipeId: "keep", params: {} }); continue; }
    const det = primaryDetection(detectionFor(sctx, u));
    if (det?.role === "direct_identifier") out.push({ unitId: u.id, recipeId: "keep", params: {} });
  }
  return out;
}

/** Utility-destroying control: suppress every non-key column, every text column and every span class. Keys keep the base plan's choice. */
export function destructiveOverrides(sctx: SelectionContext): DecisionOverride[] {
  const out: DecisionOverride[] = [];
  for (const u of sctx.units) {
    if (u.kind === "span_class") { out.push({ unitId: u.id, recipeId: "suppress", params: {} }); continue; }
    const dets = detectionFor(sctx, u);
    const isKey = dets.length > 0 && dets.every((d) => KEY_ROLES.has(d.role));
    if (!isKey) out.push({ unitId: u.id, recipeId: "suppress", params: {} });
  }
  return out;
}

export function loadModel(file: string): ModelArtifact {
  const parsed = ModelArtifactSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`model artifact invalid: ${parsed.error.issues[0]?.message ?? "schema"}`);
  if (parsed.data.registryVersion !== registry.version) throw new Error(`model built for registry ${parsed.data.registryVersion}, engine has ${registry.version}`);
  return parsed.data;
}

async function withEmbedding(goal: GoalSpec): Promise<GoalSpec> {
  if (goal.embedding) return goal;
  const embedder = await createGoalEmbedder();
  if (!embedder) return goal;
  return { ...goal, embedding: { model: embedder.model, dims: embedder.dims, vector: await embedder.embed(goal.task.description || goal.rawText) } };
}

export interface BuiltPlan { proposal: Proposal; goal: GoalSpec; overrides: DecisionOverride[]; controls: Control[]; label: string }

export async function buildPlan(ctx: EngineContext, goalIn: GoalSpec, spec: PlanSpec, variant?: Variant): Promise<BuiltPlan> {
  const goal = spec.kind === "learned" ? await withEmbedding(goalIn) : goalIn;
  const base = selectionContext(ctx, goal);
  const selector = spec.kind === "learned" ? createLearnedSelector(loadModel(spec.modelPath)) : new PolicySelector();
  const overrides: DecisionOverride[] = [];
  const controls: Control[] = [];
  if (spec.kind === "overrides") overrides.push(...spec.overrides);
  if (variant === "leaky") { overrides.push(...leakyOverrides(base)); controls.push("retained_identifiers"); }
  if (variant === "destructive") { overrides.push(...destructiveOverrides(base)); controls.push("utility_destroying"); }
  // later overrides for the same unit win
  const merged = [...new Map(overrides.map((o) => [o.unitId, o])).values()];
  const proposal = await selector.propose({ ...base, overrides: merged });
  const label = [spec.kind === "learned" ? "learned" : spec.kind === "overrides" ? `overrides:${spec.source}` : "policy", variant].filter(Boolean).join("+");
  return { proposal, goal, overrides: merged, controls, label };
}

/** The benchmark's session key: deterministic per seed (the app uses a random per-session key instead). */
export function sessionKeyForSeed(seed: number): Uint8Array {
  const hex = sha256Hex(`mask-bench/session-key/v1/${seed}`);
  return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}

export function executePlan(ctx: EngineContext, proposal: Proposal, seed: number) {
  return createExecutor().execute({ tables: ctx.tables, manifest: ctx.manifest, proposal, spans: ctx.spans, sessionKey: sessionKeyForSeed(seed) });
}

/** Valid alternative candidates per unit (for controlled single-unit substitutions). */
export function alternativesFor(sctx: SelectionContext, proposal: Proposal): Map<string, { key: string; override: DecisionOverride }[]> {
  const out = new Map<string, { key: string; override: DecisionOverride }[]>();
  for (const u of sctx.units) {
    const d = proposal.decisions.find((x) => x.unitId === u.id);
    const chosen = d?.selected ? candidateKey(d.selected.recipeId, d.selected.params) : null;
    const alts = enumerateCandidates(u, sctx).filter((c) => c.valid && keyOf(c) !== chosen)
      .map((c) => ({ key: keyOf(c), override: { unitId: u.id, recipeId: c.recipeId, params: c.params } }));
    out.set(u.id, alts);
  }
  return out;
}
