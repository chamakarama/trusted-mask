import type { DatasetManifest, DetectionSet, Evaluation, GoalSpec, Proposal, SpanDetection } from "@/contracts";
import type { TableData } from "@/core/session/types";
import type { ExecutedPlan, SpanIndex } from "@/core/execute/types";

export interface EvaluationInput {
  original: TableData[];
  manifest: DatasetManifest;
  detections: DetectionSet;
  spans: SpanIndex;
  goal: GoalSpec;
  proposal: Proposal;
  executed: ExecutedPlan;
  /** development only: independent gold spans keyed by table.column -> record id (row key value) -> spans */
  devLabels?: { table: string; column: string; idColumn: string; spans: Record<string, SpanDetection[]> }[];
}

export interface JointEvaluator {
  evaluate(input: EvaluationInput, onProgress?: (done: number, total: number, message?: string) => void): Evaluation;
}
