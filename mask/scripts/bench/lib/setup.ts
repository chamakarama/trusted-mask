/** Shared CLI setup: dataset loading, optional subset, engine context, goal and split. */
import fs from "node:fs";
import type { DecisionOverride, GoalSpec } from "@/contracts";
import { SCENARIO_GOALS, SCENARIO_META } from "@/core/goal";
import { loadSplits, type CatalogRow } from "../../labels/common";
import { catalogFor, loadDataset, relationalSubset } from "./data";
import { buildEngineContext, type DetectionMode, type EngineContext, type PlanSpec } from "./engine";

export interface Prepared { ctx: EngineContext; catalog: CatalogRow[]; subsetLog: string[]; goal: GoalSpec; split: string }

export function resolveSplit(dataset: string, requested?: string): string {
  const { splitOf } = loadSplits();
  const frozen = splitOf(dataset);
  if (requested && requested !== frozen) throw new Error(`--split ${requested} contradicts ml/SPLITS.json, which assigns ${dataset} to ${frozen}`);
  return frozen;
}

export function goalFor(scenarioId: string, dataset: string): GoalSpec {
  const goal = SCENARIO_GOALS[scenarioId];
  const meta = SCENARIO_META[scenarioId];
  if (!goal || !meta) throw new Error(`unknown scenario ${scenarioId}`);
  if (meta.dataset !== dataset) throw new Error(`scenario ${scenarioId} belongs to ${meta.dataset}, not ${dataset}`);
  return goal;
}

export function prepare(o: { dataset: string; scenarioId: string; detections: DetectionMode; limitRows?: number; split?: string; log?: (s: string) => void }): Prepared {
  const log = o.log ?? (() => {});
  const split = resolveSplit(o.dataset, o.split);
  const goal = goalFor(o.scenarioId, o.dataset);
  const catalog = catalogFor(o.dataset);
  let tables = loadDataset(o.dataset);
  let subsetLog: string[] = [];
  if (o.limitRows) {
    const s = relationalSubset(tables, catalog, o.limitRows);
    tables = s.tables; subsetLog = s.log;
    for (const l of subsetLog) log(`subset ${l}`);
  }
  log(`detections: ${o.detections}`);
  const ctx = buildEngineContext(tables, o.detections, catalog);
  return { ctx, catalog, subsetLog, goal, split };
}

export function parsePlanArg(arg: string | undefined): PlanSpec {
  if (!arg || arg === "policy") return { kind: "policy" };
  if (arg.startsWith("learned:")) return { kind: "learned", modelPath: arg.slice("learned:".length) };
  if (arg.startsWith("overrides:")) {
    const file = arg.slice("overrides:".length);
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!Array.isArray(raw)) throw new Error(`${file}: expected a JSON array of DecisionOverride`);
    const overrides = raw.map((x, i) => {
      const o = x as DecisionOverride;
      if (typeof o?.unitId !== "string" || (o.recipeId !== null && typeof o.recipeId !== "string") || typeof o.params !== "object") throw new Error(`${file}[${i}]: not a DecisionOverride {unitId, recipeId, params}`);
      return o;
    });
    return { kind: "overrides", overrides, source: file };
  }
  throw new Error(`--plan must be policy | learned:<model.json> | overrides:<file.json>, got ${arg}`);
}
