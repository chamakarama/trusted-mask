/**
 * Expansion of label records into training examples: one example per (record, goal variant).
 * Variant 0 is the goal the annotator saw; variants 1..n are paraphrases of the same scenario (ml/labels/goals.json).
 * Candidate validity is recomputed under each variant goal; a variant where the labelled choice is no longer valid
 * is dropped (and counted), never relabelled.
 */
import fs from "node:fs";
import path from "node:path";
import type { Candidate, DecisionUnit, FieldDetection, GoalSpec, LabelRecord, RecipeDef, RecipeId, RecipeParams } from "@/contracts";
import { candidateKey, RECIPES, registry } from "@/core/registry";
import { enumerateCandidates, keyOf, paramBundles, type SelectionContext } from "@/core/selector";
import { paths, readJson } from "./common";
import type { GoalSet } from "./goals";
import type { AnnotationTask } from "./lib/make_tasks";
import { STATUS_WEIGHT } from "./lib/validate";

/** Every class the candidate generator can produce, in a fixed order (registry order, then bundle order). */
export function allClasses(): { key: string; recipeId: RecipeId; params: RecipeParams }[] {
  const out: { key: string; recipeId: RecipeId; params: RecipeParams }[] = [];
  const probes: (FieldDetection | undefined)[] = [undefined, ...(["BIRTH_DATE", "AGE", "DURATION"] as const).map((subtype) => ({ subtype } as FieldDetection))];
  for (const r of RECIPES as RecipeDef[]) for (const d of probes) for (const p of paramBundles(r, d)) {
    const key = candidateKey(r.id, p);
    if (!out.some((c) => c.key === key)) out.push({ key, recipeId: r.id, params: p });
  }
  return out;
}
export const allClassKeys = (): string[] => allClasses().map((c) => c.key);

export function readRecords(file = paths.records()): LabelRecord[] {
  if (!fs.existsSync(file)) throw new Error(`${file} not found: run scripts/labels/validate.ts first`);
  return fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as LabelRecord);
}

export interface Expanded {
  exampleId: string;
  record: LabelRecord;
  variantId: string;
  goal: GoalSpec;
  unit: DecisionUnit;
  ctx: SelectionContext;
  candidates: Candidate[];
  target: string;
  acceptable: string[];
  weight: number;
}

export interface ExpandOptions { tasksDir?: string; goals?: GoalSet | null; variants?: boolean }

export function loadGoalSetIfPresent(): GoalSet | null {
  const f = path.join(path.dirname(paths.tasks()), "goals.json");
  return fs.existsSync(f) ? readJson<GoalSet>(f) : null;
}

export function expand(records: LabelRecord[], opts: ExpandOptions = {}): { examples: Expanded[]; dropped: { exampleId: string; reason: string }[]; warnings: string[] } {
  const tasksDir = opts.tasksDir ?? paths.tasks();
  const goals = opts.goals === undefined ? loadGoalSetIfPresent() : opts.goals;
  const useVariants = opts.variants ?? true;
  const examples: Expanded[] = [];
  const dropped: { exampleId: string; reason: string }[] = [];
  const warnings: string[] = [];
  if (useVariants && !goals) warnings.push("no ml/labels/goals.json: only the annotated goal is used (no paraphrase variants)");
  for (const record of records) {
    const isBench = record.validation.checks.source === "benchmark";
    // benchmark-derived: 1.0, or 0.5 when a constraint-covering test failed/was unsupported; annotations by review status
    const base = isBench ? (record.weak ? 0.5 : 1) : STATUS_WEIGHT[record.reviewer.status];
    if (!base) { dropped.push({ exampleId: record.labelId, reason: `reviewer status ${record.reviewer.status}` }); continue; }
    const taskFile = path.join(tasksDir, String(record.validation.checks.taskFile ?? ""));
    if (!fs.existsSync(taskFile)) throw new Error(`task file for ${record.labelId} not found at ${taskFile}`);
    const task = readJson<AnnotationTask>(taskFile);
    const variants: { variantId: string; goal: GoalSpec }[] = [{ variantId: `${record.scenarioId}#0`, goal: record.goal }];
    if (useVariants && goals) for (const v of goals.scenarios[record.scenarioId] ?? []) if (v.variant > 0) variants.push({ variantId: v.variantId, goal: v.goal });
    const targetKey = candidateKey(record.chosen.recipeId, record.chosen.params);
    const accKeys = record.acceptable.map((a) => candidateKey(a.recipeId, a.params));
    const kept: Expanded[] = [];
    for (const v of variants) {
      const exampleId = `${record.labelId}/${v.variantId}`;
      const ctx: SelectionContext = { manifest: task.manifest, goal: v.goal, detections: record.context.detections, units: [record.unit], registry, overrides: [] };
      const candidates = enumerateCandidates(record.unit, ctx);
      const valid = new Set(candidates.filter((c) => c.valid).map(keyOf));
      if (!valid.has(targetKey)) { dropped.push({ exampleId, reason: `labelled choice ${targetKey} is invalid under ${v.variantId}` }); continue; }
      kept.push({ exampleId, record, variantId: v.variantId, goal: v.goal, unit: record.unit, ctx, candidates, target: targetKey, acceptable: accKeys.filter((k) => valid.has(k) && k !== targetKey), weight: 0 });
    }
    // variants are not independent examples: the record's weight is shared among them
    for (const e of kept) { e.weight = base / kept.length; examples.push(e); }
  }
  return { examples, dropped, warnings };
}
