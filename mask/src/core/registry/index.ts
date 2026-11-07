import type { RecipeDef, RecipeId, RecipeParams, RecipeRegistry } from "@/contracts";
import { RECIPES, REGISTRY_VERSION } from "./recipes";

export { RECIPES, REGISTRY_VERSION };

export const registry: RecipeRegistry = { version: REGISTRY_VERSION, recipes: RECIPES };

const byId = new Map<RecipeId, RecipeDef>(RECIPES.map((r) => [r.id, r]));

export function getRecipe(id: RecipeId): RecipeDef {
  const r = byId.get(id);
  if (!r) throw new Error(`unknown recipe ${id}`);
  return r;
}

export function defaultParams(id: RecipeId): RecipeParams {
  const out: RecipeParams = {};
  for (const p of getRecipe(id).params) out[p.key] = p.default;
  return out;
}

/** Canonical candidate key: recipe id plus sorted params, e.g. generalize_datetime@resolution=hour */
export function candidateKey(id: RecipeId, params: RecipeParams): string {
  const keys = Object.keys(params).sort();
  if (!keys.length) return id;
  return `${id}@${keys.map((k) => `${k}=${String(params[k])}`).join(",")}`;
}

/** Validate params against the recipe's param definitions; returns problems (empty = ok). */
export function validateParams(id: RecipeId, params: RecipeParams): string[] {
  const def = getRecipe(id);
  const problems: string[] = [];
  const known = new Set(def.params.map((p) => p.key));
  for (const k of Object.keys(params)) if (!known.has(k)) problems.push(`unknown parameter ${k} for ${id}`);
  for (const p of def.params) {
    const v = params[p.key];
    if (v === undefined) { problems.push(`missing parameter ${p.key} for ${id}`); continue; }
    if (p.type === "enum" && !p.options?.some((o) => o.value === String(v))) problems.push(`parameter ${p.key}=${String(v)} is not an option for ${id}`);
    if (p.type === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) problems.push(`parameter ${p.key} must be a number for ${id}`);
      else {
        if (p.min !== undefined && n < p.min) problems.push(`parameter ${p.key} below minimum ${p.min}`);
        if (p.max !== undefined && n > p.max) problems.push(`parameter ${p.key} above maximum ${p.max}`);
      }
    }
    if (p.type === "boolean" && typeof v !== "boolean") problems.push(`parameter ${p.key} must be boolean for ${id}`);
  }
  return problems;
}
