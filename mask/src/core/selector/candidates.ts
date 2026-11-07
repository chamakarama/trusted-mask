import type { Candidate, DecisionUnit, FieldDetection, RecipeDef, RecipeId, RecipeParams, SpanLabel } from "@/contracts";
import { HARD_SPAN_LABELS } from "@/contracts";
import { RECIPES, candidateKey, defaultParams } from "@/core/registry";
import { detectionFor, statsFor, type SelectionContext } from "./types";

/** Parameter bundles enumerated as classes. Shared by both selectors and by the training feature export. */
export function paramBundles(recipe: RecipeDef, det: FieldDetection | undefined): RecipeParams[] {
  const d = defaultParams(recipe.id);
  switch (recipe.id) {
    case "generalize_datetime":
      return (det?.subtype === "BIRTH_DATE" ? ["month", "year"] : ["minute", "15min", "hour", "day", "week", "month"]).map((r) => ({ ...d, resolution: r }));
    case "generalize_numeric_bin":
      if (det?.subtype === "AGE") return [{ width: 5, topCode: 90 }, { width: 10, topCode: 90 }];
      if (det?.subtype === "DURATION") return [{ width: 60, topCode: 0 }, { width: 300, topCode: 0 }];
      return [{ width: 10, topCode: 0 }];
    case "generalize_postcode":
      return [{ digits: "3" }, { digits: "2" }];
    case "generalize_category_rare":
      return [{ minGroup: 5 }, { minGroup: 10 }];
    case "derive_hetu":
      return [{ ...d, ageBandYears: "10" }, { ...d, ageBandYears: "5" }];
    case "tokenize_keyed":
      return [{ scope: "dataset", format: "token" }];
    case "redact_surrogate":
      return [{ consistency: "conversation" }];
    default:
      return [d];
  }
}

export function candidateLabel(id: RecipeId, params: RecipeParams): string {
  switch (id) {
    case "keep": return "Keep";
    case "suppress": return "Remove";
    case "tokenize_keyed": return "Keyed token";
    case "redact_text": return "Redact spans";
    case "redact_typed": return "Typed placeholder";
    case "redact_surrogate": return "Realistic surrogate";
    case "generalize_datetime": return `Round to ${String(params.resolution)}`;
    case "generalize_numeric_bin": return `Bins of ${String(params.width)}${Number(params.topCode) > 0 ? `, top-code ${String(params.topCode)}+` : ""}`;
    case "generalize_postcode": return `Postcode ${String(params.digits)} digits`;
    case "generalize_category_rare": return `Merge groups < ${String(params.minGroup)}`;
    case "derive_hetu": return `Age band (${String(params.ageBandYears)} y) + sex`;
  }
}

/** Precondition checks: can the executor run this recipe on this unit? */
function preconditionProblems(recipe: RecipeDef, unit: DecisionUnit, ctx: SelectionContext, det: FieldDetection | undefined): string[] {
  const problems: string[] = [];
  if (unit.kind === "span_class") {
    if (!recipe.scope.includes("span_class")) problems.push("not a span recipe");
    if (recipe.appliesTo.spanLabels && unit.spanLabel && !recipe.appliesTo.spanLabels.includes(unit.spanLabel)) problems.push(`no surrogate generator for ${unit.spanLabel}`);
    return problems;
  }
  if (!recipe.scope.includes(unit.kind)) problems.push(`recipe scope ${recipe.scope.join("/")} does not cover ${unit.kind}`);
  for (const ref of unit.refs) {
    const { column } = statsFor(ctx, ref.table, ref.column);
    const s = column.stats;
    for (const pre of recipe.preconditions) {
      switch (pre) {
        case "has_values": if (s.nonEmpty === 0) problems.push("column is empty"); break;
        case "is_text_column": if (det?.role !== "free_text" && !det?.spanSummary) problems.push("not a text column"); break;
        case "parseable_datetime":
          if (!(column.inferredType === "date" || column.inferredType === "datetime")) problems.push("values do not parse as dates or timestamps"); break;
        case "numeric_values": if (s.numericShare < 0.9) problems.push("fewer than 90% numeric values"); break;
        case "postcode_values": if (det?.subtype !== "POSTCODE") problems.push("not a postcode column"); break;
        case "low_cardinality": if (!(s.distinct <= 200 || s.uniqueRatio < 0.05)) problems.push("too many distinct values to treat as categories"); break;
        case "valid_hetu_values":
          if (det?.subtype !== "NATIONAL_ID" || !det.evidence.some((e) => e.ruleId.includes("hetu") && (e.matchRate ?? 0) >= 0.9)) problems.push("fewer than 90% valid identity codes"); break;
        default: problems.push(`unknown precondition ${pre}`);
      }
    }
    if (recipe.appliesTo.roles && det && !recipe.appliesTo.roles.includes(det.role)) problems.push(`recipe is for ${recipe.appliesTo.roles.join("/")} columns`);
    if (recipe.appliesTo.subtypes || recipe.appliesTo.inferredTypes) {
      const okSub = recipe.appliesTo.subtypes?.includes(det?.subtype ?? "OTHER") ?? false;
      const okType = recipe.appliesTo.inferredTypes?.includes(column.inferredType) ?? false;
      if (!okSub && !okType) problems.push("column type does not match the recipe");
    }
  }
  return problems;
}

/** Hard constraints from the goal: choices that would violate the sharing setting regardless of utility. */
function hardConstraintProblems(recipe: RecipeDef, unit: DecisionUnit, ctx: SelectionContext, det: FieldDetection | undefined): string[] {
  const problems: string[] = [];
  const trust = ctx.goal.recipient.trustLevel;
  const external = trust !== "internal";
  if (unit.kind === "span_class") {
    const label = unit.spanLabel as SpanLabel;
    if (recipe.id === "keep" && HARD_SPAN_LABELS.includes(label)) problems.push(`${label} spans may never be kept verbatim`);
    if (recipe.id === "keep" && label === "HEALTH" && (external || ctx.goal.exclusions.includes("special_category"))) problems.push("health mentions are special-category data");
    if (recipe.id === "keep" && trust === "public" && label !== "ORG") problems.push("public release: no personal spans kept");
    if (recipe.id === "redact_surrogate" && ctx.goal.textNeed === "verbatim_evidence") problems.push("auditors must see what was said as a placeholder, not an invented value");
    return problems;
  }
  if (!det) return problems;
  if (recipe.id === "keep") {
    if (det.role === "direct_identifier" && external) problems.push("direct identifiers may not leave the organisation unchanged");
    if (det.role === "direct_identifier" && !external && det.subtype !== "CUSTOMER_ID" && det.subtype !== "ACCOUNT_ID" && det.subtype !== "EMPLOYEE_ID") problems.push("direct identifiers are not needed for this internal purpose");
    if (det.art9 && (ctx.goal.exclusions.includes("special_category") || trust === "public")) problems.push("special-category data is excluded for this recipient");
    if (det.role === "free_text" && external) problems.push("free text must be redacted before leaving the organisation");
    if (det.role === "technical_identifier" && trust === "public") problems.push("public release: technical identifiers are personal data");
    if (det.role === "quasi_identifier" && trust === "public" && (det.subtype === "TIMESTAMP" || det.subtype === "BIRTH_DATE" || det.subtype === "GPS_COORDINATE")) problems.push("public release: exact times, birth dates and coordinates re-identify");
  }
  if (recipe.id === "tokenize_keyed" && trust === "public") problems.push("public release: pseudonymous keys are still personal data");
  if (recipe.id === "redact_text" && ctx.goal.outputForm === "aggregate") problems.push("aggregate outputs carry no row-level text");
  return problems;
}

/** Parameter-dependent validity: a transformation that would change nothing is not a protection. */
function paramProblems(recipe: RecipeDef, params: RecipeParams, unit: DecisionUnit, ctx: SelectionContext): string[] {
  if (recipe.id !== "generalize_category_rare" || unit.kind === "span_class") return [];
  const minGroup = Number(params.minGroup);
  for (const ref of unit.refs) {
    const { column } = statsFor(ctx, ref.table, ref.column);
    const s = column.stats;
    const smallest = s.minCategoryShare !== undefined ? s.minCategoryShare * s.nonEmpty : undefined;
    if (smallest !== undefined && smallest >= minGroup) return [`no category has fewer than ${minGroup} rows: merging would change nothing (same as keep)`];
  }
  return [];
}

/** All candidates for a unit, each marked valid or not with reasons. Deterministic order. */
export function enumerateCandidates(unit: DecisionUnit, ctx: SelectionContext): Candidate[] {
  const dets = detectionFor(ctx, unit);
  const det = primaryDetection(dets);
  const out: Candidate[] = [];
  for (const recipe of RECIPES) {
    if (!recipe.scope.includes(unit.kind)) continue;
    for (const params of paramBundles(recipe, det)) {
      const problems = [...preconditionProblems(recipe, unit, ctx, det), ...hardConstraintProblems(recipe, unit, ctx, det), ...paramProblems(recipe, params, unit, ctx)];
      out.push({ recipeId: recipe.id, params, valid: problems.length === 0, invalidReasons: problems, label: candidateLabel(recipe.id, params) });
    }
  }
  return out;
}

const ROLE_RANK: Record<string, number> = { direct_identifier: 0, technical_identifier: 1, sensitive_attribute: 2, quasi_identifier: 3, free_text: 4, record_key: 5, non_sensitive: 6, unknown: 7 };

/** For a group, the detection with the strongest role decides. */
export function primaryDetection(dets: FieldDetection[]): FieldDetection | undefined {
  return [...dets].sort((a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9))[0];
}

export const keyOf = (c: Candidate): string => candidateKey(c.recipeId, c.params);
