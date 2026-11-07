/**
 * Goal set for labelling and training: per challenge scenario, the canonical GoalSpec (SCENARIO_GOALS, owned by the
 * goal agent) plus up to 2 paraphrase variants (SCENARIO_TEXTS run through the goal interpreter). Variants keep the
 * scenario id, so one annotation supervises several goal texts / embeddings. Embeddings are attached when an
 * embedder is available. Cached in ml/labels/goals.json so every later step sees the same goals.
 */
import fs from "node:fs";
import path from "node:path";
import type { GoalSpec } from "@/contracts";
import { GoalSpecSchema } from "@/contracts";
import { MASK_DIR, ML_DIR, readJson, writeJson } from "./common";

export interface GoalVariant { variantId: string; scenarioId: string; variant: number; source: "canonical" | "paraphrase"; goal: GoalSpec }
export interface GoalSet { version: 1; interpreter: string; embedder: { model: string; dims: number } | null; scenarios: Record<string, GoalVariant[]>; warnings: string[] }

export const goalsFile = (): string => path.join(ML_DIR, "labels", "goals.json");
const SCENARIOS_MODULE = path.join(MASK_DIR, "src", "core", "goal", "scenarios.ts");

interface ScenarioModule { SCENARIO_GOALS: Record<string, GoalSpec>; SCENARIO_TEXTS?: Record<string, unknown> }

/** Loads src/core/goal/scenarios.ts at runtime (owned by the goal agent). Clear error if it is missing. */
export async function loadScenarioModule(): Promise<ScenarioModule> {
  if (!fs.existsSync(SCENARIOS_MODULE)) throw new Error(`${SCENARIOS_MODULE} does not exist yet: the goal agent must provide SCENARIO_GOALS and SCENARIO_TEXTS`);
  const mod = (await import(/* @vite-ignore */ SCENARIOS_MODULE)) as Partial<ScenarioModule>;
  if (!mod.SCENARIO_GOALS) throw new Error("src/core/goal/scenarios.ts does not export SCENARIO_GOALS");
  return mod as ScenarioModule;
}

/** SCENARIO_TEXTS entries may be a string, a string[] or an object with text fields; normalise to string[]. */
function textsOf(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(textsOf);
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).flatMap(textsOf);
  return [];
}

export async function buildGoalSet(opts: { variants?: number; log?: (s: string) => void } = {}): Promise<GoalSet> {
  const nVariants = opts.variants ?? 2;
  const log = opts.log ?? (() => {});
  const mod = await loadScenarioModule();
  const goalMod = await import("@/core/goal");
  const interpreter = goalMod.createGoalInterpreter();
  const embedder = await goalMod.createGoalEmbedder();
  const warnings: string[] = [];
  const embed = async (g: GoalSpec): Promise<GoalSpec> => {
    if (g.embedding || !embedder) return g;
    return { ...g, embedding: { model: embedder.model, dims: embedder.dims, vector: await embedder.embed(g.rawText) } };
  };
  const scenarios: Record<string, GoalVariant[]> = {};
  for (const sid of Object.keys(mod.SCENARIO_GOALS).sort()) {
    const canonical = GoalSpecSchema.parse(mod.SCENARIO_GOALS[sid]);
    const list: GoalVariant[] = [{ variantId: `${sid}#0`, scenarioId: sid, variant: 0, source: "canonical", goal: await embed(canonical) }];
    const texts = [...new Set(textsOf(mod.SCENARIO_TEXTS?.[sid]).map((t) => t.trim()).filter((t) => t && t !== canonical.rawText.trim()))];
    for (const text of texts.slice(0, nVariants)) {
      try {
        const g = GoalSpecSchema.parse(await interpreter.interpret(text, { answers: {} }));
        list.push({ variantId: `${sid}#${list.length}`, scenarioId: sid, variant: list.length, source: "paraphrase", goal: await embed(g) });
      } catch (e) {
        warnings.push(`${sid}: interpreter failed on a paraphrase: ${(e as Error).message}`);
      }
    }
    if (list.length < nVariants + 1) warnings.push(`${sid}: ${list.length - 1} paraphrase variants (wanted ${nVariants})`);
    scenarios[sid] = list;
    log(`${sid}: ${list.length} goals`);
  }
  if (!embedder) warnings.push("no goal embedder available: goal.emb features are zero");
  return { version: 1, interpreter: `${interpreter.id}@${interpreter.version}`, embedder: embedder ? { model: embedder.model, dims: embedder.dims } : null, scenarios, warnings };
}

/** Cached goal set (ml/labels/goals.json); built on first use or with refresh. */
export async function loadGoalSet(opts: { refresh?: boolean; log?: (s: string) => void } = {}): Promise<GoalSet> {
  const f = goalsFile();
  if (!opts.refresh && fs.existsSync(f)) return readJson<GoalSet>(f);
  const set = await buildGoalSet(opts);
  // cache only a complete set: a missing interpreter/variants must not freeze an incomplete goals.json
  if (!set.warnings.some((w) => /paraphrase/.test(w))) writeJson(f, set);
  else (opts.log ?? console.warn)(`goal set incomplete (${set.warnings.length} warnings); ${f} not written, tasks use canonical goals only`);
  return set;
}
