/**
 * Main-thread <-> pipeline worker protocol. Every request carries a requestId; every response echoes it.
 * The main thread discards responses whose requestId is not the latest for that kind.
 * The worker owns the session: original tables, detections, span index, executed outputs.
 */
import type { DatasetManifest } from "./dataset";
import type { DetectionSet, SpanDetection } from "./detection";
import type { GoalSpec } from "./goal";
import type { Proposal } from "./proposal";
import type { RecipeId, RecipeParams } from "./recipe";
import type { Evaluation } from "./evaluation";
import type { ExportReceipt } from "./export";
import type { HighlightKind, ViewMode } from "./state";

export interface ImportFile { name: string; data: ArrayBuffer }

export interface DecisionOverride { unitId: string; recipeId: RecipeId | null; params: RecipeParams }

export interface RowFilter {
  onlyChanged?: boolean;
  unitIds?: string[];
  highlights?: HighlightKind[];
  needsReview?: boolean;
  search?: string;
}
export interface RowSort { column: string; dir: "asc" | "desc" }

export interface SpanChange extends SpanDetection { replacement: string; unitId: string; recipeId: RecipeId }
export interface CellChange {
  kind: HighlightKind;
  unitId: string;
  recipeId: RecipeId;
  /** text cells: per-span replacements (offsets refer to the ORIGINAL text) */
  spans?: SpanChange[];
}
export interface RowView {
  /** stable row index in the imported file */
  row: number;
  cells: (string | null)[];
  /** keyed by output column name; present for protected view only */
  changes?: Record<string, CellChange>;
}
export interface OutputColumn { name: string; sourceColumn: string | null; unitId: string | null; status: "kept" | "transformed" | "suppressed" | "derived" }
export interface OutputTableSummary { name: string; rowCount: number; columns: OutputColumn[]; sha256: string }

export type WorkerRequest =
  | { kind: "import"; requestId: string; files: ImportFile[] }
  | { kind: "profile"; requestId: string }
  | { kind: "propose"; requestId: string; goal: GoalSpec; selectorId: "policy" | "learned"; overrides: DecisionOverride[] }
  | { kind: "execute"; requestId: string; planHash: string }
  | { kind: "evaluate"; requestId: string; planHash: string; devLabels?: { table: string; column: string; spans: Record<string, SpanDetection[]> }[] }
  | { kind: "rows"; requestId: string; table: string; view: ViewMode; offset: number; limit: number; sort?: RowSort; filter?: RowFilter }
  | { kind: "cell"; requestId: string; table: string; row: number; column: string }
  | { kind: "export"; requestId: string; planHash: string }
  | { kind: "embed"; requestId: string; text: string }
  | { kind: "loadModel"; requestId: string; artifactUrl: string }
  | { kind: "cancel"; requestId: string; target: string };

export type WorkerResponse =
  | { kind: "progress"; requestId: string; stage: string; done: number; total: number; message?: string }
  | { kind: "imported"; requestId: string; manifest: DatasetManifest; errors: string[] }
  | { kind: "profiled"; requestId: string; detections: DetectionSet }
  | { kind: "proposed"; requestId: string; proposal: Proposal }
  | { kind: "executed"; requestId: string; planHash: string; outputHash: string; tables: OutputTableSummary[]; durationMs: number }
  | { kind: "evaluated"; requestId: string; evaluation: Evaluation }
  | { kind: "rows"; requestId: string; table: string; view: ViewMode; offset: number; total: number; columns: string[]; rows: RowView[] }
  | { kind: "cell"; requestId: string; original: string | null; protected: string | null; change: CellChange | null }
  | { kind: "exported"; requestId: string; receipt: ExportReceipt; files: { name: string; data: ArrayBuffer; mime: string }[] }
  | { kind: "embedded"; requestId: string; model: string; vector: number[] }
  | { kind: "modelLoaded"; requestId: string; modelId: string; registryVersion: string }
  | { kind: "error"; requestId: string; message: string; recoverable: boolean }
  | { kind: "cancelled"; requestId: string };
