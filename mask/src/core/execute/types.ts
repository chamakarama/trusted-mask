import type { Proposal, DatasetManifest, SpanDetection, RecipeId, OutputColumn } from "@/contracts";
import type { TableData } from "@/core/session/types";

/** Per-cell change record for text cells (offsets refer to the ORIGINAL text). */
export interface TextCellChange { spans: { start: number; end: number; label: string; replacement: string; unitId: string; recipeId: RecipeId }[] }

export interface ExecutedTable {
  name: string;
  /** output columns in order */
  columns: OutputColumn[];
  /** column-major output data, aligned with `columns` */
  data: (string | null)[][];
  rowCount: number;
  /** text cell changes keyed by `${outputColumnIndex}:${row}` */
  textChanges: Map<string, TextCellChange>;
  sha256: string;
}

export interface ExecutedPlan {
  planHash: string;
  outputHash: string;
  tables: ExecutedTable[];
  durationMs: number;
  /** derived columns and other notes the evaluator and report need */
  notes: string[];
}

export interface SpanIndex {
  /** spans for a given text cell, from the detection pass */
  get(table: string, column: string, row: number): SpanDetection[];
}

export interface ExecutionInput {
  tables: TableData[];
  manifest: DatasetManifest;
  proposal: Proposal;
  spans: SpanIndex;
  /** session secret for keyed tokenisation; never persisted or exported */
  sessionKey: Uint8Array;
}

export interface PlanExecutor {
  execute(input: ExecutionInput, onProgress?: (done: number, total: number, message?: string) => void): ExecutedPlan;
}
