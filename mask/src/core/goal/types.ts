import type { DatasetManifest, DetectionSet, GoalSpec } from "@/contracts";

export interface GoalContext {
  /** schema summary the interpreter may use: table and column names, roles. Never raw values. */
  manifest?: DatasetManifest;
  detections?: DetectionSet;
  /** answers to earlier unresolved questions, keyed by question id */
  answers: Record<string, string>;
  /** previous spec when the user edits the text or answers a question */
  previous?: GoalSpec;
}

export interface GoalInterpreter {
  readonly id: string;
  readonly version: string;
  interpret(text: string, ctx: GoalContext): Promise<GoalSpec>;
}

export interface GoalEmbedder {
  readonly model: string;
  readonly dims: number;
  embed(text: string): Promise<number[]>;
}
