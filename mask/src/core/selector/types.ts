import type { DatasetManifest, DecisionUnit, FieldDetection, GoalSpec, Proposal, RecipeRegistry, DecisionOverride } from "@/contracts";

/** Everything a selector may look at. No raw cell values: selectors decide from profiles, detections and the goal. */
export interface SelectionContext {
  manifest: DatasetManifest;
  goal: GoalSpec;
  detections: FieldDetection[];
  units: DecisionUnit[];
  registry: RecipeRegistry;
  /** user edits that override selector choices for specific units */
  overrides: DecisionOverride[];
}

export interface Selector {
  readonly id: "policy" | "learned";
  readonly version: string;
  /** Deterministic: same context gives the same proposal. Never samples. */
  propose(ctx: SelectionContext): Promise<Proposal>;
}

export function detectionFor(ctx: SelectionContext, unit: DecisionUnit): FieldDetection[] {
  const ids = new Set(unit.detectionIds);
  return ctx.detections.filter((d) => ids.has(d.id));
}

export function statsFor(ctx: SelectionContext, table: string, column: string) {
  const t = ctx.manifest.tables.find((x) => x.name === table);
  const c = t?.columns.find((x) => x.name === column);
  if (!t || !c) throw new Error(`no manifest entry for ${table}.${column}`);
  return { table: t, column: c };
}
