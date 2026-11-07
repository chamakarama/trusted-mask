/**
 * Learned selector artifact. logit(unit, class) = weights[class] . x(unit, goal) + bias[class].
 * x is the base feature vector produced by core/selector/features (featureSpec.version must match).
 * Classes are (recipe, canonical params) bundles enumerated by the candidate generator.
 * Invalid candidates are masked before softmax; if none is valid the selector abstains.
 */
import { z } from "zod";
import { RecipeIdSchema, RecipeParamsSchema } from "./recipe";

export const ModelClassSchema = z.object({
  key: z.string(),
  recipeId: RecipeIdSchema,
  params: RecipeParamsSchema,
});

export const ModelArtifactSchema = z.object({
  version: z.literal(1),
  modelId: z.string(),
  createdAt: z.string(),
  registryVersion: z.string(),
  featureSpec: z.object({ version: z.string(), baseFeatures: z.array(z.string()) }),
  embedding: z.object({ model: z.string(), dims: z.number().int(), projection: z.array(z.array(z.number())).optional() }).nullable(),
  classes: z.array(ModelClassSchema),
  /** classes.length x baseFeatures.length */
  weights: z.array(z.array(z.number())),
  bias: z.array(z.number()),
  calibration: z.object({ method: z.enum(["none", "temperature"]), temperature: z.number(), fittedOn: z.string() }),
  training: z.object({
    codeRevision: z.string(),
    dataHash: z.string(),
    splitHash: z.string(),
    config: z.record(z.unknown()),
    examples: z.object({ train: z.number().int(), val: z.number().int(), test: z.number().int() }),
    environment: z.string(),
  }),
  evaluation: z.object({
    heldOut: z.record(z.unknown()),
    baselines: z.record(z.unknown()),
    notes: z.array(z.string()),
  }),
});
export type ModelArtifact = z.infer<typeof ModelArtifactSchema>;
