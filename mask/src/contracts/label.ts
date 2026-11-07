/**
 * Training label record for method selection. Agent output is candidate supervision, not truth.
 * Provenance is mandatory; unreviewed labels are marked weak.
 */
import { z } from "zod";
import { GoalSpecSchema } from "./goal";
import { DecisionUnitSchema, CandidateSchema } from "./proposal";
import { FieldDetectionSchema } from "./detection";
import { ColumnStatsSchema, RelationshipSchema } from "./dataset";
import { RecipeIdSchema, RecipeParamsSchema } from "./recipe";

export const ChoiceSchema = z.object({ recipeId: RecipeIdSchema, params: RecipeParamsSchema });

export const LabelRecordSchema = z.object({
  version: z.literal(1),
  labelId: z.string(),
  split: z.enum(["train", "val", "test"]),
  /** source grouping key kept together across splits (dataset name) */
  sourceGroup: z.string(),
  /** challenge scenario id or generated-goal id */
  scenarioId: z.string(),
  goal: GoalSpecSchema,
  unit: DecisionUnitSchema,
  context: z.object({
    detections: z.array(FieldDetectionSchema),
    stats: z.array(ColumnStatsSchema),
    relationships: z.array(RelationshipSchema),
    /** sibling column summaries, so the annotator sees the whole table shape */
    tableColumns: z.array(z.object({ column: z.string(), role: z.string(), subtype: z.string() })),
  }),
  candidates: z.array(CandidateSchema),
  chosen: ChoiceSchema,
  acceptable: z.array(ChoiceSchema),
  rationale: z.string(),
  unresolved: z.array(z.string()),
  annotator: z.object({ model: z.string(), promptVersion: z.string(), at: z.string() }),
  challenger: z.object({
    model: z.string(),
    promptVersion: z.string(),
    at: z.string(),
    agrees: z.boolean(),
    objections: z.array(z.string()),
    counterChoice: ChoiceSchema.nullable(),
  }).nullable(),
  validation: z.object({
    schemaOk: z.boolean(),
    chosenIsValidCandidate: z.boolean(),
    acceptableAllValid: z.boolean(),
    executed: z.boolean(),
    checks: z.record(z.unknown()),
  }),
  reviewer: z.object({
    status: z.enum(["unreviewed", "agreement", "disagreement", "human_approved", "human_rejected"]),
    notes: z.string(),
  }),
  weak: z.boolean(),
});
export type LabelRecord = z.infer<typeof LabelRecordSchema>;
