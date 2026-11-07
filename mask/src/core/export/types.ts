import type { DatasetManifest, Evaluation, ExportReceipt, GoalSpec, Proposal } from "@/contracts";
import type { ExecutedPlan } from "@/core/execute/types";

export interface ExportFile { name: string; data: Uint8Array; mime: string }

export interface ExportInput {
  manifest: DatasetManifest;
  goal: GoalSpec;
  proposal: Proposal;
  executed: ExecutedPlan;
  evaluation: Evaluation;
}

export interface ExportService {
  /** Serialises the exact executed tables (no regeneration) plus the sanitised report. */
  build(input: ExportInput): Promise<{ receipt: ExportReceipt; files: ExportFile[] }>;
}
