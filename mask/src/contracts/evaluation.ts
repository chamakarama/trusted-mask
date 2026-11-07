/**
 * Evaluation of a complete executed plan: measured risks, utility checks and integrity checks,
 * with explicit unsupported checks. Never a single "safe percentage".
 */
import { z } from "zod";

export const METRIC_KINDS = ["risk", "utility", "integrity"] as const;
export const METRIC_STATUS = ["measured", "unsupported", "not_applicable", "error"] as const;

export const MetricResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(METRIC_KINDS),
  /** what the number means and how it was computed */
  definition: z.string(),
  /** table or table.column or "dataset" */
  scope: z.string(),
  status: z.enum(METRIC_STATUS),
  value: z.number().nullable(),
  unit: z.enum(["ratio", "count", "score", "seconds"]),
  /** higher is better for utility/integrity; lower is better for risk */
  direction: z.enum(["higher_better", "lower_better"]),
  threshold: z.object({ op: z.enum(["<=", ">=", "<", ">"]), value: z.number(), hard: z.boolean() }).optional(),
  passed: z.boolean().nullable(),
  detail: z.string(),
  breakdown: z.record(z.number()).optional(),
  /** whether this metric was computed against independent labels (dev only) or Mask's own detections */
  basis: z.enum(["own_detections", "independent_labels", "structural", "goal_requirement"]),
  /** unit ids this metric constrains, for linking from the review surface */
  unitIds: z.array(z.string()).optional(),
});
export type MetricResult = z.infer<typeof MetricResultSchema>;

export const EvaluationSchema = z.object({
  version: z.literal(1),
  evaluationId: z.string(),
  inputHash: z.string(),
  goalId: z.string(),
  planHash: z.string(),
  outputHash: z.string(),
  metrics: z.array(MetricResultSchema),
  /** hard-threshold failures that block export */
  hardFailures: z.array(z.string()),
  /** checks the goal asked for that Mask cannot measure */
  unsupported: z.array(z.string()),
  createdAt: z.string(),
  durationMs: z.number(),
});
export type Evaluation = z.infer<typeof EvaluationSchema>;
