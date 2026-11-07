/**
 * The app talks to the pipeline only through this interface. Two implementations:
 * - WorkerBackend: the real pipeline worker + goal interpreter.
 * - FixtureBackend (app/dev): hand-written development data, nothing measured.
 */
import type {
  CellChange, DatasetManifest, DecisionOverride, DetectionSet, Evaluation, ExportReceipt, GoalSpec, ImportFile, Proposal, RowFilter, RowSort, RowView, ViewMode,
} from "@/contracts";
import type { GoalContext } from "@/core/goal/types";
import type { ExecutedSummary, Progress } from "../store/state";

export interface RowsQuery { table: string; view: ViewMode; offset: number; limit: number; sort?: RowSort; filter?: RowFilter }
export interface RowsResult { total: number; columns: string[]; rows: RowView[]; offset: number }
export interface CellResult { original: string | null; protected: string | null; change: CellChange | null }
export interface ExportFiles { receipt: ExportReceipt; files: { name: string; data: ArrayBuffer; mime: string }[] }

export interface Backend {
  readonly kind: "worker" | "fixture";
  importFiles(files: ImportFile[]): Promise<{ manifest: DatasetManifest; errors: string[] }>;
  profile(): Promise<DetectionSet>;
  interpret(text: string, ctx: GoalContext): Promise<GoalSpec>;
  propose(goal: GoalSpec, selectorId: "policy" | "learned", overrides: DecisionOverride[]): Promise<Proposal>;
  execute(planHash: string): Promise<ExecutedSummary>;
  evaluate(planHash: string): Promise<Evaluation>;
  rows(q: RowsQuery): Promise<RowsResult>;
  cell(table: string, row: number, column: string): Promise<CellResult>;
  exportPlan(planHash: string): Promise<ExportFiles>;
  loadModel(artifactUrl: string): Promise<{ modelId: string; registryVersion: string }>;
  /** progress events from long steps; stage names come from the worker */
  onProgress(cb: (p: Progress) => void): void;
  dispose(): void;
}

/** True for rejections that only mean "a newer request replaced this one". */
export function isSuperseded(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return m === "superseded" || m === "cancelled";
}
