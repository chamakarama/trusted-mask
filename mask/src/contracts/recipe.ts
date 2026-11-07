/**
 * Recipe: a supported transformation with its scope, parameters, preconditions and executor.
 * The registry (core/registry) is the single list of recipes. Selectors only rank what the registry offers.
 */
import { z } from "zod";
import { PrivacyRoleSchema, SpanLabelSchema, SubtypeSchema } from "./taxonomy";
import { InferredTypeSchema } from "./dataset";

export const RECIPE_IDS = [
  "keep",
  "suppress",
  "tokenize_keyed",
  "redact_text",
  "redact_typed",
  "redact_surrogate",
  "generalize_datetime",
  "generalize_numeric_bin",
  "generalize_postcode",
  "generalize_category_rare",
  "derive_hetu",
] as const;
export const RecipeIdSchema = z.enum(RECIPE_IDS);
export type RecipeId = z.infer<typeof RecipeIdSchema>;

/**
 * field: one column; field_group: linked columns transformed consistently (joins survive);
 * span_class: all spans of one label inside one text column; table: whole-table operations (aggregation, later).
 */
export const RECIPE_SCOPES = ["field", "field_group", "span_class", "table"] as const;
export const RecipeScopeSchema = z.enum(RECIPE_SCOPES);
export type RecipeScope = z.infer<typeof RecipeScopeSchema>;

export const ParamDefSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["enum", "number", "boolean", "string"]),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  default: z.union([z.string(), z.number(), z.boolean()]),
  min: z.number().optional(),
  max: z.number().optional(),
  description: z.string(),
  /** editable by the user in the review surface */
  editable: z.boolean().default(true),
});
export type ParamDef = z.infer<typeof ParamDefSchema>;

export const RecipeParamsSchema = z.record(z.union([z.string(), z.number(), z.boolean()]));
export type RecipeParams = z.infer<typeof RecipeParamsSchema>;

export const RecipeDefSchema = z.object({
  id: RecipeIdSchema,
  version: z.string(),
  name: z.string(),
  /** one-sentence plain-language summary shown to users */
  summary: z.string(),
  scope: z.array(RecipeScopeSchema),
  appliesTo: z.object({
    roles: z.array(PrivacyRoleSchema).optional(),
    subtypes: z.array(SubtypeSchema).optional(),
    spanLabels: z.array(SpanLabelSchema).optional(),
    inferredTypes: z.array(InferredTypeSchema).optional(),
  }),
  params: z.array(ParamDefSchema),
  /** ids of precondition checks implemented in core/registry/preconditions */
  preconditions: z.array(z.string()),
  executor: z.string(),
  effects: z.object({
    preservesJoins: z.boolean(),
    preservesFormat: z.boolean(),
    distribution: z.enum(["exact", "coarsened", "none"]),
    removesContent: z.boolean(),
  }),
  /** evaluation checks that must run when this recipe is used */
  evaluation: z.array(z.string()),
  /** honest statement of what the recipe does not guarantee */
  limitations: z.string(),
  /** UI highlight category */
  highlight: z.enum(["keep", "tokenize", "generalize", "redact", "suppress", "derive"]),
});
export type RecipeDef = z.infer<typeof RecipeDefSchema>;

export const RecipeRegistrySchema = z.object({
  version: z.string(),
  recipes: z.array(RecipeDefSchema),
});
export type RecipeRegistry = z.infer<typeof RecipeRegistrySchema>;
