/**
 * Execute one complete plan and write the private run folder:
 *   <run>/plan.json      Proposal (plus `controls` for positive/negative control plans)
 *   <run>/goal.json      GoalSpec
 *   <run>/executed.json  hashes, output columns, executor notes, detection mode, controls, seed, staging summary
 *   <run>/staging/...    protected tables + rowmaps (private)        <run>/export/...  shareable tables only
 *   <run>/original/...   only for --limit-rows: the same subset of the original tables (private)
 */
import fs from "node:fs";
import path from "node:path";
import { REGISTRY_VERSION } from "@/core/registry";
import { hashOf } from "@/core/util/hash";
import type { CatalogRow } from "../../labels/common";
import { writeJson } from "../../labels/common";
import { recordKeyOf } from "./data";
import { buildPlan, executePlan, type EngineContext, type PlanSpec, type Variant, type BuiltPlan } from "./engine";
import { writeOriginalSubset, writeStaging, type StagingResult } from "./staging";
import type { GoalSpec } from "@/contracts";

export const ADAPTER_VERSION = "mask-bench-1.0.0";

export interface RunPlanOptions {
  runDir: string;
  dataset: string;
  scenarioId: string;
  split: string;
  goal: GoalSpec;
  spec: PlanSpec;
  variant?: Variant;
  seed: number;
  catalog: CatalogRow[];
  omitRowmaps?: string[];
  /** set when the tables are a --limit-rows subset; the subset originals are written for the toolkit */
  limitRows?: number;
  subsetLog?: string[];
  /** reorder rows of each released table deterministically (robustness check of the rowmap path) */
  shuffle?: boolean;
}

export interface RunPlanResult { runDir: string; planHash: string; outputHash: string; built: BuiltPlan; staging: StagingResult; executedFile: string }

/** Deterministic permutation (mulberry32 Fisher-Yates) for --shuffle. */
export function seededPermutation(n: number, seed: number): number[] {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j]!, p[i]!]; }
  return p;
}

export async function runPlan(ctx: EngineContext, o: RunPlanOptions, prebuilt?: BuiltPlan): Promise<RunPlanResult> {
  const t0 = Date.now();
  const built = prebuilt ?? await buildPlan(ctx, o.goal, o.spec, o.variant);
  const executed = executePlan(ctx, built.proposal, o.seed);
  fs.mkdirSync(o.runDir, { recursive: true });
  let originalDir: string | null = null;
  let originalFiles: { name: string; path: string; sha256: string }[] = [];
  if (o.limitRows) {
    originalDir = path.join(o.runDir, "original", o.dataset);
    originalFiles = writeOriginalSubset(originalDir, ctx.tables);
  }
  const staging = writeStaging({
    runDir: o.runDir, dataset: o.dataset, omitRowmaps: o.omitRowmaps,
    tables: executed.tables.map((t, i) => {
      const original = ctx.tables.find((x) => x.name === t.name)!;
      return { table: t, fileName: original.fileName, recordKey: recordKeyOf(o.catalog, t.name), original, ...(o.shuffle ? { rowOrder: seededPermutation(t.rowCount, o.seed + i) } : {}) };
    }),
  });
  writeJson(path.join(o.runDir, "plan.json"), { ...built.proposal, controls: built.controls });
  writeJson(path.join(o.runDir, "goal.json"), built.goal);
  const executedFile = path.join(o.runDir, "executed.json");
  writeJson(executedFile, {
    version: 1,
    adapterVersion: ADAPTER_VERSION,
    dataset: o.dataset,
    scenarioId: o.scenarioId,
    split: o.split,
    detectionMode: ctx.detectionMode,
    detectionNote: ctx.detectionMode === "catalog"
      ? "catalog mode: field roles come from the organiser's field_catalog.csv (privileged labels); spans from the Mask span detector. Transformation-only comparison, not end-to-end detection performance."
      : "mask mode: field roles from the Mask rules field detector, spans from the Mask span detector (end-to-end).",
    detector: ctx.detector,
    spanDetector: ctx.spanDetector,
    planLabel: built.label,
    plan: { kind: o.spec.kind, ...(o.spec.kind === "learned" ? { model: o.spec.modelPath } : {}), ...(o.spec.kind === "overrides" ? { overridesSource: o.spec.source } : {}), variant: o.variant ?? null },
    controls: built.controls,
    overrides: built.overrides,
    seed: o.seed,
    sessionKey: "derived deterministically: sha256('mask-bench/session-key/v1/<seed>'); benchmark runs are reproducible for a seed, the app uses a random per-session key",
    inputHash: built.proposal.inputHash,
    goalId: built.proposal.goalId,
    planHash: built.proposal.planHash,
    outputHash: executed.outputHash,
    registryVersion: REGISTRY_VERSION,
    proposalWarnings: built.proposal.warnings,
    limitRows: o.limitRows ?? null,
    subsetLog: o.subsetLog ?? [],
    originalDir,
    originalFiles,
    shuffled: !!o.shuffle,
    omittedRowmaps: o.omitRowmaps ?? [],
    executorNotes: executed.notes,
    tables: executed.tables.map((t) => {
      const st = staging.tables.find((s) => s.name === t.name)!;
      return {
        name: t.name, fileName: st.fileName, released: st.released, rowCount: t.rowCount, rowsWritten: st.rowsWritten,
        recordKey: recordKeyOf(o.catalog, t.name), executorSha256: t.sha256,
        stagingPath: st.stagingPath ? path.relative(o.runDir, st.stagingPath) : null, stagingSha256: st.stagingSha256,
        exportPath: st.exportPath ? path.relative(o.runDir, st.exportPath) : null, exportSha256: st.exportSha256,
        rowmap: { ...st.rowmap, path: st.rowmap.path ? path.relative(o.runDir, st.rowmap.path) : null },
        naRewrites: st.naRewrites,
        columns: t.columns,
      };
    }),
    stagingHash: hashOf(staging.tables.map((s) => ({ n: s.name, h: s.stagingSha256, r: s.rowmap.sha256 }))),
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
  });
  return { runDir: o.runDir, planHash: built.proposal.planHash, outputHash: executed.outputHash, built, staging, executedFile };
}
