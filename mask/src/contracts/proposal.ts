/**
 * Decision units and proposals. A proposal is a complete plan: one decision per unit, each with its
 * valid candidates, scores (model preference, when a learned selector produced them), the selected recipe,
 * parameters and the reason taken from the executed decision trace.
 */
import { z } from "zod";
import { ColumnRefSchema } from "./dataset";
import { RecipeIdSchema, RecipeParamsSchema } from "./recipe";
import { SpanLabelSchema } from "./taxonomy";

export const DECISION_UNIT_KINDS = ["field", "field_group", "span_class", "table"] as const;
export const DecisionUnitSchema = z.object({
  id: z.string(),
  kind: z.enum(DECISION_UNIT_KINDS),
  /** one ref for field / span_class / table, several for field_group */
  refs: z.array(ColumnRefSchema).min(1),
  /** span_class only */
  spanLabel: SpanLabelSchema.optional(),
  /** field_group only: relationship ids that bind the group */
  relationshipIds: z.array(z.string()).optional(),
  /** detection ids this unit is based on */
  detectionIds: z.array(z.string()),
  /** parent unit for span_class units: the text column's field unit */
  parentUnitId: z.string().optional(),
});
export type DecisionUnit = z.infer<typeof DecisionUnitSchema>;

export const CandidateSchema = z.object({
  recipeId: RecipeIdSchema,
  params: RecipeParamsSchema,
  valid: z.boolean(),
  invalidReasons: z.array(z.string()),
  /** raw selector logit, when available */
  logit: z.number().optional(),
  /** model preference among valid candidates (softmax), when a learned selector scored it. Not a safety probability. */
  preference: z.number().optional(),
  /** deterministic policy rank (1 = chosen) when the policy selector ranked it */
  policyRank: z.number().int().optional(),
  /** short label for the alternative in the UI */
  label: z.string(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const REVIEW_STATES = ["proposed", "accepted", "edited", "flagged"] as const;
export const DecisionSchema = z.object({
  unitId: z.string(),
  candidates: z.array(CandidateSchema),
  selected: z.object({ recipeId: RecipeIdSchema, params: RecipeParamsSchema }).nullable(),
  abstained: z.boolean(),
  abstainReason: z.string().optional(),
  /** concise reason shown first */
  reason: z.string(),
  /** technical detail, expands on demand */
  detail: z.array(z.string()),
  source: z.enum(["selector", "user"]),
  reviewState: z.enum(REVIEW_STATES),
  needsReview: z.boolean(),
  reviewReasons: z.array(z.string()),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const TokenScopeSchema = z.object({
  id: z.string(),
  columns: z.array(ColumnRefSchema),
  /** the key never leaves the session; only its id is recorded */
  keyId: z.string(),
});
export type TokenScope = z.infer<typeof TokenScopeSchema>;

export const SelectorInfoSchema = z.object({
  id: z.enum(["policy", "learned"]),
  version: z.string(),
  modelArtifact: z.string().optional(),
  registryVersion: z.string(),
  /** goal embedding model used, if any */
  embeddingModel: z.string().optional(),
});
export type SelectorInfo = z.infer<typeof SelectorInfoSchema>;

export const ProposalSchema = z.object({
  version: z.literal(1),
  proposalId: z.string(),
  inputHash: z.string(),
  goalId: z.string(),
  selector: SelectorInfoSchema,
  units: z.array(DecisionUnitSchema),
  decisions: z.array(DecisionSchema),
  tokenScopes: z.array(TokenScopeSchema),
  /** sha256 over (unitId, selected recipe, params) in unit order: identifies the plan */
  planHash: z.string(),
  createdAt: z.string(),
  /** combined-plan warnings found by the selector (joint checks run in evaluation) */
  warnings: z.array(z.string()),
});
export type Proposal = z.infer<typeof ProposalSchema>;
