/**
 * GoalSpec: the structured, editable interpretation of what the user wants to do with the data.
 * The recipient and constraints stay explicit; the embedding is an optional derived feature.
 * Goal wording never grants permission to release anything.
 */
import { z } from "zod";

export const TASK_KINDS = [
  "topic_mining",      // themes, contact reasons, trends from text
  "model_training",    // train a classifier / chatbot / forecasting model
  "quality_audit",     // humans read samples to check compliance
  "statistics",        // publish or share aggregate tables / dashboards
  "research",          // analytical research on row-level data
  "operations",        // internal dashboards and workload analysis
  "fraud_security",    // fraud or security detection across records
  "other",
] as const;
export const TaskKindSchema = z.enum(TASK_KINDS);
export type TaskKind = z.infer<typeof TaskKindSchema>;

export const TRUST_LEVELS = ["internal", "contractual", "controlled_research", "public"] as const;
export const TrustLevelSchema = z.enum(TRUST_LEVELS);
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

export const OUTPUT_FORMS = ["row_level", "text_corpus", "aggregate"] as const;
export const OutputFormSchema = z.enum(OUTPUT_FORMS);
export type OutputForm = z.infer<typeof OutputFormSchema>;

export const TIME_RESOLUTIONS = ["exact", "minute", "15min", "hour", "day", "week", "month", "year"] as const;
export const TimeResolutionSchema = z.enum(TIME_RESOLUTIONS);
export type TimeResolution = z.infer<typeof TimeResolutionSchema>;

export const LOCATION_RESOLUTIONS = ["exact", "street", "postcode", "postcode3", "municipality", "region", "none"] as const;
export const LocationResolutionSchema = z.enum(LOCATION_RESOLUTIONS);
export type LocationResolution = z.infer<typeof LocationResolutionSchema>;

export const TEXT_NEEDS = [
  "none",              // text columns are not needed
  "topic_only",        // meaning and topic matter, identifiers can be placeholders
  "fluent",            // natural reading text, surrogates preferred over placeholders
  "verbatim_evidence", // readers must see that e.g. an ID was given, placeholders keep the evidence
] as const;
export const TextNeedSchema = z.enum(TEXT_NEEDS);
export type TextNeed = z.infer<typeof TextNeedSchema>;

export const UnresolvedQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  /** which GoalSpec keys the answer changes */
  affects: z.array(z.string()),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
});
export type UnresolvedQuestion = z.infer<typeof UnresolvedQuestionSchema>;

export const GoalSpecSchema = z.object({
  version: z.literal(1),
  /** stable hash of the normalised structured content (not of rawText) */
  goalId: z.string(),
  rawText: z.string(),
  task: z.object({ kind: TaskKindSchema, description: z.string() }),
  recipient: z.object({ description: z.string(), trustLevel: TrustLevelSchema }),
  outputForm: OutputFormSchema,
  /** what the recipient needs to compute, in the user's words ("handle time by intent") */
  measures: z.array(z.string()),
  /** fields the analysis groups or filters by, as column names or descriptions */
  groupings: z.array(z.string()),
  resolution: z.object({
    time: TimeResolutionSchema.optional(),
    location: LocationResolutionSchema.optional(),
    /** age band width in years; 0 = exact */
    ageBandYears: z.number().int().nonnegative().optional(),
  }),
  /** columns the user said they need, as "table.column" or bare column names */
  requiredFields: z.array(z.string()),
  /** does the analysis need to link rows of the same person/entity across rows or tables */
  linkage: z.enum(["none", "within_table", "across_tables"]),
  textNeed: TextNeedSchema,
  /** categories of content the recipient explicitly must not receive (e.g. "special_category") */
  exclusions: z.array(z.string()),
  threatAssumptions: z.array(z.string()),
  unresolved: z.array(UnresolvedQuestionSchema),
  embedding: z.object({ model: z.string(), dims: z.number().int(), vector: z.array(z.number()) }).optional(),
  provenance: z.object({
    interpreter: z.string(),
    version: z.string(),
    /** matched challenge scenario id, if the interpreter recognised one (informational only) */
    scenarioMatch: z.string().optional(),
    notes: z.array(z.string()).default([]),
  }),
});
export type GoalSpec = z.infer<typeof GoalSpecSchema>;
