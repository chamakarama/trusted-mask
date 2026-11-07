import type { DatasetManifest, DetectionSet, FieldDetection, SpanDetection, Relationship } from "@/contracts";
import type { TableData } from "@/core/session/types";

export interface ProfileResult { manifest: DatasetManifest }

/** Profiles typed statistics and relationships for imported tables. Never copies raw values into the manifest. */
export interface Profiler {
  profile(tables: TableData[], onProgress?: (done: number, total: number, message?: string) => void): ProfileResult;
}

export interface FieldDetector {
  readonly id: string;
  readonly version: string;
  /** Classify every column. Uses the manifest stats plus a bounded sample of values from each column. */
  detectFields(tables: TableData[], manifest: DatasetManifest, spans: SpanDetector, onProgress?: (done: number, total: number, message?: string) => void): DetectionSet;
}

export interface SpanDetector {
  readonly id: string;
  readonly version: string;
  /** Spans never overlap; offsets are [start, end) into `text`. Deterministic. */
  detect(text: string, context?: { language?: string; column?: string; previousText?: string }): SpanDetection[];
}

export type { FieldDetection, Relationship };
