/**
 * Explicit UI phases. The app may only be in one phase; transitions are driven by worker results that
 * carry the request id they answer, so stale answers are discarded.
 */
export const PHASES = [
  "empty",
  "importing",
  "profiling",
  "needs_input",
  "proposing",
  "evaluating",
  "review_ready",
  "updating",
  "exporting",
  "complete",
  "failed",
  "cancelled",
] as const;
export type Phase = (typeof PHASES)[number];

export type ViewMode = "original" | "protected";

export type HighlightKind = "keep" | "tokenize" | "generalize" | "redact" | "suppress" | "derive" | "review";
