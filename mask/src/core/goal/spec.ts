import type { GoalSpec } from "@/contracts";
import { hashOf } from "@/core/util/hash";

export type GoalSpecDraft = Omit<GoalSpec, "goalId">;

/** goalId = hash of the structured content, without rawText, embedding and provenance. */
export function goalIdOf(spec: GoalSpecDraft | GoalSpec): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rawText: _r, embedding: _e, provenance: _p, ...rest } = spec as GoalSpec;
  const content: Record<string, unknown> = { ...rest };
  delete content.goalId;
  return hashOf(content);
}

export function withGoalId(spec: GoalSpecDraft | GoalSpec): GoalSpec {
  return { ...(spec as GoalSpec), goalId: goalIdOf(spec) };
}

/** Editable GoalSpec keys the UI and the merge logic work with. */
export const EDITABLE_KEYS = [
  "task", "recipient", "outputForm", "measures", "groupings", "resolution", "requiredFields",
  "linkage", "textNeed", "exclusions", "threatAssumptions",
] as const;
export type EditableKey = (typeof EDITABLE_KEYS)[number];
