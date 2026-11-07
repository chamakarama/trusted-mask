/**
 * Build annotation tasks: one JSON file per (decision unit x challenge scenario) for every catalogued dataset.
 *
 *   npx vite-node scripts/labels/make_tasks.ts [--dataset health,finance] [--limit 20] [--refresh-stats] [--refresh-goals]
 *
 * Writes ml/labels/tasks/<dataset>/<scenario>/<unit-safe>.json, ml/labels/tasks/INDEX.json and ml/labels/BATCHES.md.
 * Tasks contain statistics and catalog descriptions only, never raw cell values.
 */
import fs from "node:fs";
import path from "node:path";
import type { Candidate, DatasetManifest, DecisionUnit, FieldDetection, GoalSpec, Relationship } from "@/contracts";
import { columnKey } from "@/contracts";
import { REGISTRY_VERSION, getRecipe, registry } from "@/core/registry";
import { buildDecisionUnits, enumerateCandidates, keyOf, PolicySelector, type SelectionContext } from "@/core/selector";
import { FEATURE_SPEC_VERSION } from "@/core/selector/features";
import {
  CATALOG_DETECTOR, ML_DIR, PROMPT_VERSION, type CatalogRow, type DatasetProfile, type Scenario, buildManifest, detectionsFor, gitRevision,
  loadCatalog, loadScenarios, loadSpanCounts, loadSplits, loadUtilityTasks, manifestSubset, parseArgs, paths, profileDataset, safeId, taskIdOf, writeJson,
} from "../common";

export const TASK_VERSION = 1;
export const TEAM_A = ["health", "finance", "cyber", "mobility"];
export const TEAM_B = ["smart_city", "energy", "education", "public_admin"];
export const TEST_DOMAIN = "customer_service";

export interface TaskCandidate {
  key: string; label: string; recipeId: string; params: Candidate["params"]; valid: boolean; invalidReasons: string[];
  recipe: { name: string; summary: string; limitations: string };
}

export interface AnnotationTask {
  version: number;
  taskId: string;
  split: "train" | "val" | "test";
  sourceGroup: string;
  scenarioId: string;
  scenario: {
    title: string; recipient: string; purpose: string; trustLevel: string; threatModel: string; legalContext: string; notes: string;
    utilityTasks: { id: string; table: string; description: string; kind: string }[];
    suggestedTargets: { text: string; status: "hint, not binding" };
  };
  goal: GoalSpec;
  unit: DecisionUnit;
  columns: {
    table: string; column: string; inferredType: string;
    catalog: { role: string; subtype: string; dataKind: string; art9: boolean; description: string; traps: string } | null;
    stats: DatasetManifest["tables"][number]["columns"][number]["stats"];
  }[];
  span: { label: string; count: number; rowsWithSpans: number; rowsScanned: number } | null;
  detections: FieldDetection[];
  siblings: { table: string; column: string; role: string; subtype: string }[];
  relationships: Relationship[];
  candidates: TaskCandidate[];
  baseline: { key: string | null; label: string | null; reason: string; status: "baseline suggestion, do not copy blindly" };
  manifest: DatasetManifest;
  expectedOutput: { shape: Record<string, unknown>; rules: string[] };
  provenance: { generator: string; taskVersion: number; registryVersion: string; featureSpec: string; codeRevision: string; catalog: string; promptVersion: string };
}

export interface MakeTasksOptions {
  datasets?: string[];
  limit?: number;
  outDir?: string;
  refreshStats?: boolean;
  /** goal per scenario; defaults to SCENARIO_GOALS through the cached goal set */
  goalFor?: (scenarioId: string) => GoalSpec | undefined;
  log?: (s: string) => void;
}

export interface TaskIndexEntry { taskId: string; file: string; split: string; dataset: string; scenarioId: string; unitId: string; unitKind: string; validCandidates: number }

const EXPECTED_SHAPE = {
  taskId: "<copy taskId>",
  chosen: { key: "<one candidate key with valid=true>" },
  acceptable: [{ key: "<other valid candidate keys you would also accept; may be empty>" }],
  rationale: "<= 60 words: why this recipe for this recipient and purpose",
  unresolved: ["<questions whose answer would change the choice; may be empty>"],
  annotator: { model: "<model name and version>", promptVersion: PROMPT_VERSION },
};
const RULES = [
  "chosen.key and every acceptable[].key must be copied exactly from candidates[].key and have valid=true",
  "acceptable must not repeat chosen; list only alternatives you would sign off for this recipient and purpose",
  "do not give probabilities or confidence percentages",
  "baseline is a deterministic rule suggestion: agree only if it is right for this scenario",
  "scenario.suggestedTargets are hints from the challenge, not binding requirements",
  "if no valid candidate is acceptable, choose the least bad valid one and say why in unresolved",
];

export async function makeTasks(opts: MakeTasksOptions = {}): Promise<{ index: TaskIndexEntry[]; warnings: string[] }> {
  const log = opts.log ?? (() => {});
  const outDir = opts.outDir ?? paths.tasks();
  const catalog = loadCatalog();
  const scenarios = loadScenarios();
  const utility = loadUtilityTasks();
  const { splitOf } = loadSplits();
  const codeRevision = gitRevision();
  let goalFor = opts.goalFor;
  if (!goalFor) {
    const { loadGoalSet } = await import("../goals");
    const set = await loadGoalSet({ log });
    goalFor = (sid) => set.scenarios[sid]?.[0]?.goal;
  }
  const datasets = opts.datasets ?? [...new Set(catalog.map((r) => r.dataset))].sort();
  const index: TaskIndexEntry[] = [];
  const warnings: string[] = [];

  for (const ds of datasets) {
    const rows = catalog.filter((r) => r.dataset === ds);
    if (!rows.length) { warnings.push(`no catalog rows for ${ds}`); continue; }
    const dp = await profileDataset(ds, rows, { refresh: opts.refreshStats, log });
    const manifest = buildManifest(dp);
    const spans = loadSpanCounts(ds);
    const detections = detectionsFor(dp, rows, spans);
    const units = buildDecisionUnits(manifest, detections);
    const split = splitOf(ds);
    for (const sc of scenarios.filter((s) => s.dataset === ds)) {
      const goal = goalFor(sc.id);
      if (!goal) { warnings.push(`no GoalSpec for scenario ${sc.id}; skipped`); continue; }
      const ctx: SelectionContext = { manifest, goal, detections, units, registry, overrides: [] };
      const policy = await new PolicySelector().propose(ctx);
      const chosen = units.slice(0, opts.limit ?? units.length);
      for (const unit of chosen) {
        const task = buildTask({ ds, sc, goal, unit, ctx, dp, rows, spans, split, policy: policy.decisions.find((d) => d.unitId === unit.id), utility, codeRevision });
        const rel = path.join(ds, sc.id, `${safeId(unit.id)}.json`);
        writeJson(path.join(outDir, rel), task);
        index.push({ taskId: task.taskId, file: rel, split, dataset: ds, scenarioId: sc.id, unitId: unit.id, unitKind: unit.kind, validCandidates: task.candidates.filter((c) => c.valid).length });
      }
      log(`${ds}/${sc.id}: ${chosen.length} tasks`);
    }
  }
  // merge with an existing index: entries of datasets not processed in this run are kept
  const indexFile = path.join(outDir, "INDEX.json");
  if (fs.existsSync(indexFile)) {
    const prev = JSON.parse(fs.readFileSync(indexFile, "utf8")) as { tasks: TaskIndexEntry[] };
    index.push(...prev.tasks.filter((t) => !datasets.includes(t.dataset)));
  }
  index.sort((a, b) => a.taskId.localeCompare(b.taskId));
  writeJson(indexFile, { version: TASK_VERSION, count: index.length, warnings, tasks: index });
  return { index, warnings };
}

function buildTask(a: {
  ds: string; sc: Scenario; goal: GoalSpec; unit: DecisionUnit; ctx: SelectionContext; dp: DatasetProfile; rows: CatalogRow[];
  spans: ReturnType<typeof loadSpanCounts>; split: "train" | "val" | "test"; policy: import("@/contracts").Decision | undefined;
  utility: ReturnType<typeof loadUtilityTasks>; codeRevision: string;
}): AnnotationTask {
  const { unit, ctx } = a;
  const candidates = enumerateCandidates(unit, ctx);
  const ids = new Set(unit.detectionIds);
  const dets = ctx.detections.filter((d) => ids.has(d.id));
  const refKeys = new Set(unit.refs.map(columnKey));
  const tables = [...new Set(unit.refs.map((r) => r.table))];
  const policyKey = a.policy?.selected ? keyOf({ ...a.policy.selected, valid: true, invalidReasons: [], label: "" }) : null;
  const policyCand = policyKey ? candidates.find((c) => keyOf(c) === policyKey) : undefined;
  const spanInfo = unit.kind === "span_class" && unit.spanLabel ? (() => {
    const d = dets[0];
    return { label: unit.spanLabel, count: d?.spanSummary?.byLabel[unit.spanLabel] ?? 0, rowsWithSpans: d?.spanSummary?.rowsWithSpans ?? 0, rowsScanned: d?.spanSummary?.rowsScanned ?? 0 };
  })() : null;
  return {
    version: TASK_VERSION,
    taskId: taskIdOf(a.sc.id, unit.id),
    split: a.split,
    sourceGroup: a.ds,
    scenarioId: a.sc.id,
    scenario: {
      title: a.sc.title, recipient: a.sc.recipient, purpose: a.sc.purpose, trustLevel: a.sc.trust_level, threatModel: a.sc.threat_model,
      legalContext: a.sc.legal_context ?? "", notes: a.sc.notes ?? "",
      utilityTasks: a.sc.utility_requirements.map((id) => a.utility.get(id) ?? { id, table: "", description: "(description not found in toolkit)", kind: "" }),
      suggestedTargets: { text: a.sc.suggested_privacy_targets ?? "", status: "hint, not binding" },
    },
    goal: a.goal,
    unit,
    columns: unit.refs.map((r) => {
      const t = ctx.manifest.tables.find((x) => x.name === r.table)!;
      const c = t.columns.find((x) => x.name === r.column)!;
      const cat = a.rows.find((x) => x.table === r.table && x.column === r.column);
      return {
        table: r.table, column: r.column, inferredType: c.inferredType, stats: c.stats,
        catalog: cat ? { role: cat.privacy_role, subtype: cat.subtype, dataKind: cat.data_kind, art9: cat.art9, description: cat.description, traps: cat.traps } : null,
      };
    }),
    span: spanInfo,
    detections: dets,
    siblings: a.rows.filter((r) => tables.includes(r.table) && !refKeys.has(`${r.table}.${r.column}`)).map((r) => ({ table: r.table, column: r.column, role: r.privacy_role, subtype: r.subtype })),
    relationships: ctx.manifest.relationships.filter((r) => refKeys.has(columnKey(r.from)) || refKeys.has(columnKey(r.to))),
    candidates: candidates.map((c) => {
      const def = getRecipe(c.recipeId);
      return { key: keyOf(c), label: c.label, recipeId: c.recipeId, params: c.params, valid: c.valid, invalidReasons: c.invalidReasons, recipe: { name: def.name, summary: def.summary, limitations: def.limitations } };
    }),
    baseline: {
      key: policyCand ? keyOf(policyCand) : null, label: policyCand?.label ?? null,
      reason: a.policy?.abstained ? `policy abstained: ${a.policy.abstainReason ?? ""}` : a.policy?.reason ?? "",
      status: "baseline suggestion, do not copy blindly",
    },
    manifest: manifestSubset(ctx.manifest, unit.refs),
    expectedOutput: { shape: EXPECTED_SHAPE, rules: RULES },
    provenance: {
      generator: "scripts/labels/make_tasks.ts", taskVersion: TASK_VERSION, registryVersion: REGISTRY_VERSION, featureSpec: FEATURE_SPEC_VERSION,
      codeRevision: a.codeRevision, catalog: CATALOG_DETECTOR.version, promptVersion: PROMPT_VERSION,
    },
  };
}

export function batchesMarkdown(index: TaskIndexEntry[]): string {
  const by = (ds: string) => index.filter((t) => t.dataset === ds);
  const scen = (ds: string) => [...new Set(by(ds).map((t) => t.scenarioId))].sort().map((s) => `${s}: ${by(ds).filter((t) => t.scenarioId === s).length}`).join(", ");
  const line = (ds: string, team: string, note = "") => `| ${ds} | ${team} | ${by(ds)[0]?.split ?? "-"} | ${by(ds).length} | ${scen(ds)} | ${note} |`;
  const all = [...new Set(index.map((t) => t.dataset))];
  const other = all.filter((d) => !TEAM_A.includes(d) && !TEAM_B.includes(d) && d !== TEST_DOMAIN);
  return [
    "# Annotation batches",
    "",
    "Generated by `scripts/labels/make_tasks.ts`; do not edit by hand. One batch per dataset.",
    "Task files: `ml/labels/tasks/<dataset>/<scenario>/<unit>.json`. Put each annotation at the same relative path under",
    "`ml/labels/annotations/` and each challenge under `ml/labels/challenges/` (see `ml/README.md`).",
    "",
    "| Batch (dataset) | Team | Split | Tasks | Per scenario | Notes |",
    "|---|---|---|---|---|---|",
    ...TEAM_A.filter((d) => all.includes(d)).map((d) => line(d, "Team A")),
    ...TEAM_B.filter((d) => all.includes(d)).map((d) => line(d, "Team B")),
    ...(all.includes(TEST_DOMAIN) ? [line(TEST_DOMAIN, "either, LAST", "held-out TEST domain: annotate after all others; never used for training or tuning")] : []),
    ...other.map((d) => line(d, "unassigned")),
    "",
    `Total: ${index.length} tasks. Team A: ${index.filter((t) => TEAM_A.includes(t.dataset)).length}. Team B: ${index.filter((t) => TEAM_B.includes(t.dataset)).length}. Test (${TEST_DOMAIN}): ${by(TEST_DOMAIN).length}.`,
    "",
    "Unit kinds: " + ["field", "field_group", "span_class"].map((k) => `${k} ${index.filter((t) => t.unitKind === k).length}`).join(", ") + ".",
    `Tasks with a single valid candidate (still annotate; they are easy checks): ${index.filter((t) => t.validCandidates === 1).length}.`,
    "",
  ].join("\n");
}
