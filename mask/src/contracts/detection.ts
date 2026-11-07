/**
 * Detection: what each field and text span contains, with evidence and uncertainty.
 * Confidence here is rule/model strength, never a probability of risk.
 */
import { z } from "zod";
import { ColumnRefSchema } from "./dataset";
import { ConfidenceSchema, PrivacyRoleSchema, SpanLabelSchema, SubtypeSchema } from "./taxonomy";

export const EvidenceSchema = z.object({
  ruleId: z.string(),
  description: z.string(),
  /** share of sampled values that matched, when applicable */
  matchRate: z.number().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const FieldDetectionSchema = z.object({
  id: z.string(),
  kind: z.literal("field"),
  ref: ColumnRefSchema,
  role: PrivacyRoleSchema,
  subtype: SubtypeSchema,
  /** GDPR Art. 9 special category hint */
  art9: z.boolean(),
  confidence: ConfidenceSchema,
  /** heuristic score in [0,1]; not calibrated */
  score: z.number(),
  evidence: z.array(EvidenceSchema),
  needsReview: z.boolean(),
  reviewReasons: z.array(z.string()),
  /** relationship ids from the manifest this column participates in */
  relationships: z.array(z.string()),
  alternatives: z.array(z.object({ role: PrivacyRoleSchema, subtype: SubtypeSchema, score: z.number() })),
  /** for free_text columns: span counts by label from the scan */
  spanSummary: z.object({
    rowsScanned: z.number().int(),
    rowsWithSpans: z.number().int(),
    byLabel: z.record(z.number().int()),
    detectorId: z.string(),
    detectorVersion: z.string(),
  }).optional(),
  detector: z.object({ id: z.string(), version: z.string() }),
});
export type FieldDetection = z.infer<typeof FieldDetectionSchema>;

export const SpanDetectionSchema = z.object({
  /** character offsets [start, end) into the cell text */
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  label: SpanLabelSchema,
  score: z.number(),
  ruleId: z.string(),
  needsReview: z.boolean().optional(),
});
export type SpanDetection = z.infer<typeof SpanDetectionSchema>;

/** Spans for one cell. Large; lives in the worker and is fetched per visible row range. */
export const CellSpansSchema = z.object({
  table: z.string(),
  column: z.string(),
  row: z.number().int(),
  spans: z.array(SpanDetectionSchema),
});
export type CellSpans = z.infer<typeof CellSpansSchema>;

export const DetectionSetSchema = z.object({
  version: z.literal(1),
  inputHash: z.string(),
  fields: z.array(FieldDetectionSchema),
  createdAt: z.string(),
});
export type DetectionSet = z.infer<typeof DetectionSetSchema>;
